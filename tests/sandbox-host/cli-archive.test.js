import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';

import { createCliCache } from '../../sandbox-host/runner/cli-cache.js';
import { extractTarMember } from '../../sandbox-host/runner/tar-member.js';

// The tar archives are made by the system's own tar (the real thing, in each of its formats).
const hasTar = spawnSync('tar', ['--version']).status === 0;
const archiveTest = hasTar ? test : test.skip;
const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A folder shaped like Pandoc's archive (a program, links to it, a manual), packed in the given format. */
function makeArchive(format, { gzip = true, longName = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'noureon-tar-'));
  const program = Buffer.alloc(70_000, 'p');
  program.write('#!/bin/sh\necho hi\n');
  const top = longName || 'pandoc-9.9';
  mkdirSync(join(root, top, 'bin'), { recursive: true });
  mkdirSync(join(root, top, 'share', 'man'), { recursive: true });
  writeFileSync(join(root, top, 'bin', 'pandoc'), program, { mode: 0o755 });
  symlinkSync('pandoc', join(root, top, 'bin', 'pandoc-lua'));
  writeFileSync(join(root, top, 'share', 'man', 'pandoc.1'), 'manual\n'.repeat(900));
  const out = join(root, 'out.tar');
  const made = spawnSync('tar', [`--format=${format}`, '-cf', out, '-C', root, top]);
  assert.equal(made.status, 0, String(made.stderr));
  let bytes = readFileSync(out);
  if (gzip) bytes = spawnSync('gzip', ['-c', out], { maxBuffer: 1 << 26 }).stdout;
  rmSync(root, { recursive: true, force: true });
  return { bytes, program, member: `${top}/bin/pandoc` };
}

const collect = () => {
  const parts = [];
  const sink = new Writable({ write(chunk, _encoding, done) { parts.push(Buffer.from(chunk)); done(); } });
  return { sink, result: () => Buffer.concat(parts) };
};
const tarOf = (bytes) => Readable.from([spawnSync('gunzip', ['-c'], { input: bytes, maxBuffer: 1 << 26 }).stdout]);

for (const format of ['ustar', 'gnu', 'pax', 'v7']) {
  archiveTest(`the one named file is taken out of a ${format} tar, byte for byte, and the rest is left`, async () => {
    const { bytes, program, member } = makeArchive(format);
    const { sink, result } = collect();
    const done = await extractTarMember(tarOf(bytes), member, sink, { maxBytes: 1 << 20 });
    assert.equal(done.found, true);
    assert.equal(done.bytes, program.length);
    assert.ok(result().equals(program));
  });
}

archiveTest('a very long name (gnu and pax records) still finds its file', async () => {
  const longName = `pandoc-${'x'.repeat(130)}`;
  for (const format of ['gnu', 'pax']) {
    const { bytes, program, member } = makeArchive(format, { longName });
    const { sink, result } = collect();
    const done = await extractTarMember(tarOf(bytes), member, sink, { maxBytes: 1 << 20 });
    assert.equal(done.found, true, format);
    assert.ok(result().equals(program), format);
  }
});

archiveTest('a file that is not in the archive is not found, a link is not taken for it, and a name that is only a part is not enough', async () => {
  const { bytes } = makeArchive('ustar');
  for (const member of ['pandoc-9.9/bin/missing', 'pandoc-9.9/bin/pandoc-lua', 'bin/pandoc', 'pandoc-9.9/bin']) {
    const { sink, result } = collect();
    const done = await extractTarMember(tarOf(bytes), member, sink, { maxBytes: 1 << 20 });
    assert.equal(done.found, false, member);
    assert.equal(result().length, 0, member);
  }
});

archiveTest('a file larger than allowed stops the unpacking, and a damaged archive is refused', async () => {
  const { bytes, member } = makeArchive('ustar');
  await assert.rejects(() => extractTarMember(tarOf(bytes), member, collect().sink, { maxBytes: 1000 }), /larger than allowed/);
  const tar = spawnSync('gunzip', ['-c'], { input: bytes, maxBuffer: 1 << 26 }).stdout;
  const damaged = Buffer.from(tar);
  damaged[10] ^= 0xff;
  await assert.rejects(() => extractTarMember(Readable.from([damaged]), member, collect().sink, { maxBytes: 1 << 20 }), /damaged/);
});

archiveTest('the cache unpacks an archive: it is checked as a whole, only the program is kept (under the archive\'s hash), and a second use fetches nothing', async () => {
  const { bytes, program, member } = makeArchive('ustar');
  const dir = mkdtempSync(join(tmpdir(), 'noureon-clicache-'));
  try {
    let fetched = 0;
    const fetchImpl = async () => { fetched += 1; return new Response(bytes, { status: 200 }); };
    const cache = createCliCache({ dir, hosts: ['github.com'], maxBytes: 1 << 20, maxUnpackedBytes: 1 << 20, fetchImpl });
    const spec = { url: 'https://github.com/o/r/releases/download/v1/p.tar.gz', sha256: sha256Of(bytes), size: bytes.length, archive: { format: 'tar.gz', member, size: program.length } };
    const path = await cache.ensure(spec);
    assert.ok(readFileSync(path).equals(program));
    assert.equal(statSync(path).mode & 0o777, 0o755);
    assert.equal(path, join(dir, sha256Of(bytes)));
    await cache.ensure(spec);
    assert.equal(fetched, 1);
    assert.deepEqual(readdirSync(dir), [sha256Of(bytes)], 'nothing else is left');

    const other = mkdtempSync(join(tmpdir(), 'noureon-clicache-'));
    try {
      const strict = createCliCache({ dir: other, hosts: ['github.com'], maxBytes: 1 << 20, maxUnpackedBytes: 1 << 20, fetchImpl });
      await assert.rejects(() => strict.ensure({ ...spec, sha256: sha256Of('else') }), /size or hash differs/, 'a different archive is refused');
      await assert.rejects(() => strict.ensure({ ...spec, archive: { ...spec.archive, size: program.length + 1 } }), /size or hash differs|larger/, 'the listed size of the program must be the real one');
      await assert.rejects(() => strict.ensure({ ...spec, archive: { ...spec.archive, member: 'pandoc-9.9/bin/missing' } }), /not in the archive/);
      await assert.rejects(() => strict.ensure({ ...spec, archive: { ...spec.archive, member: '../bin/pandoc' } }), /not described correctly/);
      await assert.rejects(() => strict.ensure({ ...spec, archive: { ...spec.archive, format: 'zip' } }), /not described correctly/);
      await assert.rejects(() => strict.ensure({ ...spec, archive: { ...spec.archive, size: 5 << 20 } }), /not described correctly/, 'more than the unpacked limit');
      await assert.rejects(() => strict.ensure({ ...spec, archive: { ...spec.archive }, sha256: sha256Of(bytes), url: 'https://evil.example/p.tar.gz' }), /may not be fetched/);
      assert.deepEqual(readdirSync(other), [], 'a refused download leaves nothing');
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

archiveTest('an archive that is not gzip, or that unpacks to more than the limit, is refused', async () => {
  const { bytes, member, program } = makeArchive('ustar');
  const dir = mkdtempSync(join(tmpdir(), 'noureon-clicache-'));
  try {
    const notGzip = Buffer.from('this is not an archive at all');
    const cache = createCliCache({ dir, hosts: ['github.com'], maxBytes: 1 << 20, maxUnpackedBytes: 1 << 20, fetchImpl: async () => new Response(notGzip, { status: 200 }) });
    await assert.rejects(() => cache.ensure({ url: 'https://github.com/x', sha256: sha256Of(notGzip), size: notGzip.length, archive: { format: 'tar.gz', member, size: 10 } }), /could not be opened/);
    const small = createCliCache({ dir, hosts: ['github.com'], maxBytes: 1 << 20, maxUnpackedBytes: 50_000, fetchImpl: async () => new Response(bytes, { status: 200 }) });
    await assert.rejects(() => small.ensure({ url: 'https://github.com/x', sha256: sha256Of(bytes), size: bytes.length, archive: { format: 'tar.gz', member, size: program.length } }), /not described correctly/);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

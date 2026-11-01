import assert from 'node:assert/strict';
import test from 'node:test';

import { openServerPdfPages } from '../../server/pdf-page-image.js';
import { makeScanPdf } from '../helpers/scan-pdf.js';

// The pages of a scanned PDF drawn on the server (R8): a JPEG of at most 1024 on the longest side for each page.

test('the pages of a scan are drawn as JPEGs, small, and a page that is not there is refused', async () => {
  const pdf = await openServerPdfPages(makeScanPdf(3, { width: 2000, height: 1000 }));
  try {
    assert.equal(pdf.pages, 3);
    const page = await pdf.render(2);
    assert.equal(page.mimeType, 'image/jpeg');
    assert.deepEqual([...page.bytes.subarray(0, 2)], [0xff, 0xd8]);
    const { loadImage } = await import('@napi-rs/canvas');
    const picture = await loadImage(Buffer.from(page.bytes));
    assert.equal(Math.max(picture.width, picture.height), 1024, 'cut to the longest side of 1024');
    assert.ok(picture.width > picture.height);
    const { createCanvas } = await import('@napi-rs/canvas');
    const probe = createCanvas(picture.width, picture.height);
    probe.getContext('2d').drawImage(picture, 0, 0);
    const [red, , blue] = probe.getContext('2d').getImageData(picture.width >> 1, picture.height >> 1, 1, 1).data;
    assert.ok(blue > 200 && red < 60, 'the second page of the scan is blue: it is drawn, not blank');
    await assert.rejects(() => pdf.render(4));
    await assert.rejects(() => pdf.render(0));
  } finally {
    await pdf.close();
  }
});

// How much memory the cloud sync keeps for its "what was uploaded last time" copy (uploadBaseline), with a lot of history.
// docs/superpowers/specs/2026-11-12-on-demand-loading-design.md §13.10 has the numbers made with it.
//
//   node --expose-gc scripts/sync-baseline-size.mjs [conversations=700] [imageKB=400]
//
// It makes a workspace like scripts/on-demand-stress.mjs does, turns it into the rows the sync keeps (pictures are not in them: they are
// asset references in the cloud), copies them the way the baseline is copied, drops the workspace (what on-demand loading does with a
// conversation nobody has open) and says how much the rows still keep alive.
import { randomBytes, randomUUID } from 'node:crypto';

if (typeof globalThis.gc !== 'function') throw new Error('Run with: node --expose-gc scripts/sync-baseline-size.mjs');
const { encodeWorkspaceConversationShadow } = await import('../src/app/sync/cloud-sync-v2-codecs.js');
const { cloneShadowRows } = await import('../src/app/sync/cloud-sync-v2-shared.js');

const N = Number(process.argv[2]) || 700;
const KB = Number(process.argv[3]) || 400;
const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore'.split(' ');
const paragraph = (count) => Array.from({ length: count }, () => words[Math.floor(Math.random() * words.length)]).join(' ');
const heapMB = () => { globalThis.gc(); globalThis.gc(); return process.memoryUsage().heapUsed / 1048576; };

const userId = randomUUID();
const start = heapMB();
let workspace = {
  folders: [],
  astras: [],
  conversations: Array.from({ length: N }, (_, index) => ({
    id: randomUUID(), title: `c${index}`, model: 'm', provider: 'p', createdAt: '2026-09-01T00:00:00Z', lastUpdatedAt: '2026-09-01T00:00:00Z',
    messages: Array.from({ length: 20 }, (__, at) => ({
      id: randomUUID(), role: at % 2 ? 'model' : 'user', createdAt: '2026-09-01T00:00:00Z',
      parts: [{ text: paragraph(at % 2 ? 300 : 40) }, ...(at === 0 && index % 5 === 0 ? [{ inlineData: { mimeType: 'image/jpeg', data: randomBytes(KB * 1024).toString('base64') } }] : [])]
    }))
  }))
};
const withWorkspace = heapMB();
const rows = await encodeWorkspaceConversationShadow({ workspace, userId });
const baseline = cloneShadowRows(rows);
workspace = null;
const afterDrop = heapMB();
console.log(JSON.stringify({
  conversations: N,
  workspaceMB: Number((withWorkspace - start).toFixed(1)),
  baselineKeepsAfterTheWorkspaceIsGoneMB: Number((afterDrop - start).toFixed(1)),
  messageRows: baseline.messages.length
}));

import OFFICIAL_ASTRA_ENTRIES from './entries.js';
import { applyOfficialNourasSafetyOverride } from '../../app/runtime/nouras/nouras-policy.js';

const OFFICIAL_ASTRAS = OFFICIAL_ASTRA_ENTRIES.map(applyOfficialNourasSafetyOverride);

export { OFFICIAL_ASTRAS };
export default OFFICIAL_ASTRAS;

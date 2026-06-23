import updateLogs, { updateLogEntries } from './update-logs/entries.js';

globalThis.updateLogs = updateLogEntries;

export { updateLogEntries as updateLogs };
export default updateLogs;

// Feature styles that ship with the chat runtime rather than the startup shell,
// so they are emitted as their own stylesheet next to this lazily loaded chunk.
import '../styles/file-cards.css';
import { startRuntimeEntry } from './runtime-entry.js';

export const legacyAppReady = startRuntimeEntry();

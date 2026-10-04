// Feature styles that ship with the chat runtime rather than the startup shell,
// so they are emitted as their own stylesheet next to this lazily loaded chunk.
import '../styles/file-cards.css';
import '../styles/sandbox-run.css';
import '../styles/ledger.css';
import '../styles/citations.css';
import '../styles/scrollbars.css';
import '../styles/edge-fades.css';
import '../styles/cli-menu.css';
import '../styles/model-picker.css';
import '../styles/notification.css';
import '../styles/dictation.css';
import { startRuntimeEntry } from './runtime-entry.js';

export const legacyAppReady = startRuntimeEntry();

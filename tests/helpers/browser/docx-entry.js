// The Word preview bundled for a browser (tests/browser/docx-preview.e2e.js), with a way to make small .docx packages by hand.
import JSZip from 'jszip';

import { renderDocxPreview } from '../../../src/app/ui/files/previews/docx-page-preview.js';

window.docx = { JSZip, renderDocxPreview };

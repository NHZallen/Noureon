// Writes the `noureon` Python module (the same text the browser sandbox installs) to the file given, so the image and the browser
// run the same one.
import { writeFileSync } from 'node:fs';
import { NOUREON_MODULE } from '../public/sandbox/runtime.js';

writeFileSync(process.argv[2] || 'noureon.py', NOUREON_MODULE);

// Where the files of the library that runs Whisper are on this site (their addresses are made by the build): kept apart so that the code that uses them can be tested without a build. Page only.

import ortMjs from '../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import ortWasm from '../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';

export { ortMjs, ortWasm };

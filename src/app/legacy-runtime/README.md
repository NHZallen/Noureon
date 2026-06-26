# Legacy Runtime Fragments

The legacy runtime fragments have been retired. Production now boots through
`src/app/runtime-entry.js`, which loads the real legacy core module at
`src/app/runtime/legacy-core/legacy-core.js`.

This directory is kept only as a historical marker while the remaining legacy
core state is migrated into smaller runtime modules.

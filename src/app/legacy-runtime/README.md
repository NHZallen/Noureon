# Retired Legacy Runtime Fragments

The legacy runtime fragments are retired. Production now boots through
`src/app/runtime-entry.js`, which loads the real legacy core module:

```text
src/app/runtime/legacy-core/legacy-core.js
```

The old `virtual:legacy-app-runtime` concat path and Vite virtual runtime plugin
have been removed. Keep `src/app/legacy-runtime/fragments` empty; runtime
template fragments under `src/templates/fragments` are unrelated.

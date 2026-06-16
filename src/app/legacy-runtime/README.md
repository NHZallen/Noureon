# Legacy Runtime Fragments

The old single-file app runtime is split into small ordered fragments here.
`src/app/legacy-app.js` imports `virtual:legacy-app-runtime`, and the Vite plugin in
`vite.config.js` assembles these fragments for dev and production builds.

This keeps the source tree free of one oversized app file while preserving the
legacy runtime's execution order during the larger migration.

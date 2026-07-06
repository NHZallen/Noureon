# Roadmap

This roadmap captures public project direction for Noureon. It is intentionally high level and excludes internal agent execution notes.

## Current Focus

1. Continue extracting legacy runtime code into smaller feature modules.
2. Keep security boundaries measurable with regression tests and source guards.
3. Maintain local-first storage and explicit provider request flows.
4. Improve image generation and editing workflows.
5. Keep PWA installability, import/export, and model council workflows stable.

## Near-Term Work

1. Reduce legacy runtime bundle size while preserving behavior.
2. Expand provider coverage for image and multimodal requests.
3. Improve error messages for provider, proxy, and offline failures.
4. Add public screenshots and setup examples before a wider launch.
5. Continue reducing CSS override debt and documenting unavoidable exceptions.

## Privacy And Safety

1. No automatic conversation export path should be reintroduced.
2. Server-side form proxy endpoints must remain optional and environment-configured.
3. Secrets, provider keys, and real third-party endpoint URLs must not be committed.

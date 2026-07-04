# OpenRouter Image Generation Roadmap

OpenRouter image generation support is present and covered by regression tests. The remaining work is about hardening, polish, and provider breadth.

## Completed

1. Register curated OpenRouter image generation models.
2. Normalize image settings to supported aspect ratio and resolution values.
3. Support image-to-image prompts using the latest generated image or a new attachment.
4. Keep image generation requests buffered when a model does not support streaming image output.
5. Add targeted edit guidance for annotated references.

## Next

1. Broaden model metadata as OpenRouter adds or retires image-capable models.
2. Improve provider-facing error messages for unsupported size, ratio, and attachment combinations.
3. Add more UI regression coverage for mobile generated-image editing.
4. Continue extracting image generation runtime code away from legacy core.
5. Document self-hosting requirements for image-capable providers.

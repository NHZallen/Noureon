# The server (server/): `node server/main.js`. Built by Coolify (Dockerfile build pack) from the repository root.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
# The archive tool, the font subsetter and the XML and Markdown readers, for the fonts embedded in the Word and PowerPoint files Python makes
# (server/office-fonts.js) and the decks of the design system: only these, with the versions the app and its tests use.
RUN mkdir /tmp/deps && cd /tmp/deps && npm init -y > /dev/null && npm install --omit=dev --ignore-scripts --no-audit --no-fund jszip@3.10.1 harfbuzzjs@1.6.2 @xmldom/xmldom@0.9.12 marked@15.0.12 pdfjs-dist@6.3.289 && mv node_modules /app/node_modules && rm -rf /tmp/deps
# The native tools that draw slides, for the visual check (server/slides/). Without them the server still runs (it says `slides_unavailable` at start)
# and the page makes the check itself, so a platform that has no build of them must not stop the image from being made.
RUN mkdir /tmp/native && cd /tmp/native && npm init -y > /dev/null && (npm install --omit=dev --ignore-scripts --no-audit --no-fund @napi-rs/canvas@1.0.9 @resvg/resvg-js@2.6.2 && cp -r node_modules/. /app/node_modules/ || echo "drawing slides is not available in this image"); rm -rf /tmp/native
# ffmpeg, to cut the videos and recordings of a project into the windows the search by meaning reads and to take frames from a video (server/ffmpeg-runner.js). Without it the server still runs; those files are then left aside.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
# Whisper for speech to text, so that a reply the server makes can turn a recording into text when the page is closed (server/whisper-runner.js): the model the browser runs too, with onnxruntime for Node.
# Only the Linux x64 runtime is kept (the GPU libraries and the other systems' are left out). The model is fetched into the image (server/whisper-download.mjs); without it the first piece waits for the download.
RUN mkdir /tmp/whisper && cd /tmp/whisper && npm init -y > /dev/null && npm install --omit=dev --ignore-scripts --no-audit --no-fund @huggingface/transformers@4.3.2 \
 && cp -r node_modules/. /app/node_modules/ && cd / && rm -rf /tmp/whisper \
 && (cd /app/node_modules/onnxruntime-node/bin/napi-v6 && rm -rf darwin win32 linux/arm64 linux/x64/libonnxruntime_providers_cuda.so linux/x64/libonnxruntime_providers_tensorrt.so)
COPY server ./server
RUN WHISPER_CACHE_DIR=/app/.whisper node server/whisper-download.mjs && mkdir -p /app/.whisper && chown -R node:node /app/.whisper
# The shared modules the server reuses from the app (scripts/server-shared-modules.json); without them the server cannot start.
COPY src ./src
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.js"]

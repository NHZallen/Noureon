# The server (server/): `node server/main.js`. Built by the host (Zeabur) from the repository root.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
# The archive tool and the font subsetter, for the fonts embedded in the Word and PowerPoint files Python makes (server/office-fonts.js): only these two, with the versions the app uses.
RUN mkdir /tmp/deps && cd /tmp/deps && npm init -y > /dev/null && npm install --omit=dev --ignore-scripts --no-audit --no-fund jszip@3.10.1 harfbuzzjs@1.6.2 && mv node_modules /app/node_modules && rm -rf /tmp/deps
COPY server ./server
# The shared modules the server reuses from the app (scripts/server-shared-modules.json); without them the server cannot start.
COPY src ./src
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.js"]

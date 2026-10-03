# The server (server/): `node server/main.js`. Built by the host (Zeabur) from the repository root.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY server ./server
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.js"]

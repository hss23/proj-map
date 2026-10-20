# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS build
WORKDIR /app
# Toolchain only needed if a better-sqlite3 prebuilt binary is unavailable for the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/data/prospects.db
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Seeds 500 mock businesses automatically on first start (empty volume).
CMD ["node", "dist/index.js"]

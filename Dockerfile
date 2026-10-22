# Self-hosted bigospeedrun.com (phase B of ~/nil/bigospeedrun-notes/self-host-scope.md).
# The image takes a prebuilt dist: run `npm run build` in GitHub
# Actions first; this image never builds the site.
# Build: docker build -t bigospeedrun-site .
# Run:   docker run --rm --read-only --cap-drop ALL --memory 384m -p 127.0.0.1:3200:3000 \
#          --env-file <root-only env file with ANTHROPIC_API_KEY, DISCORD_WEBHOOK_URL,
#          DISCORD_CHAT_LOG_WEBHOOK_URL> bigospeedrun-site
# Node 22.23.4 fixes CVE-2026-111497 (Brotli decoder, 2026-10-21); bump the tag and digest together.
# Memory limit 384 MiB (compose.yaml); the V8 heap cap below keeps Node under it.

FROM node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 NODE_OPTIONS=--max-old-space-size=256
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/package.json ./package.json
COPY server/site-server.ts ./server/site-server.ts
# The egress allowlist proxy runs from this same image (ops/self-host/compose.yaml).
COPY ops/self-host/egress-proxy.mjs ./ops/self-host/egress-proxy.mjs
COPY src/lib ./src/lib
COPY dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/robots.txt').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--experimental-strip-types", "server/site-server.ts"]

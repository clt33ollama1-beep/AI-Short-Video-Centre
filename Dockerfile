# Stage 1: Build frontend bundle
FROM node:22-slim AS builder
WORKDIR /app

# Install from package.json without platform-locked lockfile so native optional bindings
# (rolldown, tailwindcss/oxide, lightningcss) resolve cleanly for the target arch.
COPY package.json ./
RUN npm install --legacy-peer-deps

COPY tsconfig.json vite.config.ts index.html metadata.json server.ts ./
COPY src ./src

RUN npm run build

# Stage 2: Production runtime
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/assets ./src/assets

RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.ts"]

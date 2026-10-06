# ── Stage 1: build shared + server ──────────────────────────────────────────
FROM node:22-alpine AS server-build
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY shared/ ./shared/
COPY server/ ./server/
RUN npm run build --workspace=shared && npm run build --workspace=server

# ── Stage 2: build client ────────────────────────────────────────────────────
FROM node:22-alpine AS client-build
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY shared/ ./shared/
COPY client/ ./client/
# shared must be built so the client can resolve @bowling/shared
RUN npm run build --workspace=shared && npm run build --workspace=client

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev

# Compiled server + seed data
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/shared/dist ./shared/dist
COPY server/seed-data ./server/seed-data

# Client static files — served by Express
COPY --from=client-build /app/client/dist ./public

EXPOSE 4000
CMD ["node", "server/dist/index.js"]

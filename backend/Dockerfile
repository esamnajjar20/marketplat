# ── Build Stage ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# TERMUX-FIX-01: bcrypt (native) replaced with bcryptjs (pure JS) so the
# backend also runs on Termux/Android — see hash.ts's own comment for
# the full rationale. bcryptjs needs no native compilation, so the
# python3/make/g++ toolchain this stage used to install just for
# bcrypt's node-gyp postinstall step is no longer needed.

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci && npx prisma generate

COPY src ./src

RUN npm run build

# ── Production Stage ─────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production && \
    npm install --no-save prisma@^5.0.0 && \
    npx prisma generate && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
COPY ecosystem.config.js ./ecosystem.config.js

RUN mkdir -p logs && chown -R nodejs:nodejs /app && chmod +x ./docker-entrypoint.sh

USER nodejs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]

# ── Build Stage ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

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

# ===========================================
# إضافة سطر تثبيت openssl و wget (حل مشكلة Prisma + Alpine)
RUN apk add --no-cache openssl wget
# ===========================================

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY package*.json ./
COPY prisma ./prisma/

# ملاحظة: تم حذف "npm install prisma@^5.0.0" الزائد، لأن npx prisma generate سيعمل بشكل كافٍ
RUN npm ci --only=production && \
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

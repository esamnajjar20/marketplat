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

# bcrypt (optionalDependencies) يحتاج ترجمة native عبر node-gyp إن لم يجد
# prebuilt binary مطابق لِـ musl/Alpine — بدون python3/make/g++ هنا، npm
# ci يتخطى الحزمة بصمت (optional) ويسقط تلقائيًا إلى bcryptjs الأبطأ (انظر
# hash.ts). نثبّت أدوات البناء كـ virtual package مؤقت، ثم نحذفها فور
# انتهاء التثبيت حتى لا تكبر صورة الإنتاج النهائية.
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm ci --only=production && \
    npx prisma generate && \
    apk del .build-deps && \
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

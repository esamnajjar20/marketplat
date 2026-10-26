# Build from the monorepo root:
# docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# Copy every workspace manifest so pnpm can validate the root lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

FROM base AS builder
ENV NODE_ENV=development
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --frozen-lockfile --filter classifieds-platform-backend...

COPY apps/api ./apps/api
RUN pnpm --filter classifieds-platform-backend exec prisma generate --schema prisma/schema.prisma \
    && pnpm --filter classifieds-platform-backend build

FROM base AS production
ENV NODE_ENV=production
ENV PORT=5000
WORKDIR /repo

RUN apk add --no-cache openssl wget \
    && addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs appuser

COPY apps/api/prisma ./apps/api/prisma
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && pnpm install --prod --frozen-lockfile --filter classifieds-platform-backend \
    && pnpm --filter classifieds-platform-backend exec prisma generate --schema prisma/schema.prisma \
    && apk del .build-deps \
    && pnpm store prune

COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
COPY --from=builder /repo/apps/api/ecosystem.config.js ./apps/api/ecosystem.config.js

RUN mkdir -p /repo/apps/api/logs \
    && chown -R appuser:nodejs /repo/apps/api \
    && chmod +x /repo/apps/api/docker-entrypoint.sh

WORKDIR /repo/apps/api
USER appuser
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]

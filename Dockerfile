# ---------- Base ----------
FROM node:20-alpine AS base
WORKDIR /app
# musl<->glibc compat helps some native deps
RUN apk add --no-cache libc6-compat
# enable pnpm via corepack
ARG PNPM_VERSION=9
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

# ---------- Deps (installs node_modules with lockfile) ----------
FROM base AS deps
# Use a writable, cacheable PNPM store path
ENV PNPM_STORE_DIR=/pnpm-store
# Only copy manifests first for better layer caching
COPY package.json pnpm-lock.yaml* ./
# Install ALL deps (dev+prod) for the build step
# Cache the store across builds
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store

# ---------- Builder (runs the Next.js build) ----------
FROM base AS builder
ENV NODE_ENV=development
ENV PNPM_STORE_DIR=/pnpm-store
# Reuse node_modules from deps to avoid re-resolving
COPY --from=deps /app/node_modules ./node_modules
# Now copy the whole project
COPY . .
# Cache Next build artifacts to speed rebuilds
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    pnpm build

# ---------- Runner (smallest possible runtime) ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# healthcheck uses curl
RUN apk add --no-cache curl
# non-root user
RUN addgroup -g 1001 -S nodejs \
 && adduser -S nextjs -u 1001

# If you later switch to Next "output: standalone" we can copy the standalone bundle.
# For now, copy the classic artifacts.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next

# Permissions and ports
RUN chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000

# Simple healthcheck hits our API probe
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS "http://localhost:3000/api/health" || exit 1

# Start Next.js
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]

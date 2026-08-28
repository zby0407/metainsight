# Frontend Dockerfile
# Supports two targets:
#   --target dev   — install deps only, run `pnpm dev` at container start
#   --target prod  — full build baked in, run `pnpm start` at container start (default if no --target is specified)

ARG PNPM_STORE_PATH=/root/.local/share/pnpm/store
ARG NPM_REGISTRY

# ── Base: shared setup ────────────────────────────────────────────────────────
FROM node:22-alpine AS base
ARG PNPM_STORE_PATH
ARG NPM_REGISTRY
# Configure corepack registry before installing pnpm so the download itself
# succeeds in restricted networks (COREPACK_NPM_REGISTRY controls where
# corepack fetches package managers from).
RUN if [ -n "${NPM_REGISTRY}" ]; then \
      export COREPACK_NPM_REGISTRY="${NPM_REGISTRY}"; \
    fi && \
    corepack enable && corepack install -g pnpm@10.26.2
RUN pnpm config set store-dir ${PNPM_STORE_PATH}
# Optionally override npm registry for restricted networks (e.g. NPM_REGISTRY=https://registry.npmmirror.com)
RUN if [ -n "${NPM_REGISTRY}" ]; then pnpm config set registry "${NPM_REGISTRY}"; fi
RUN pnpm config set fetch-retries 10 \
    && pnpm config set fetch-timeout 600000 \
    && pnpm config set fetch-retry-maxtimeout 120000 \
    && pnpm config set network-concurrency 5
WORKDIR /app
COPY frontend ./frontend

# ── Dev: install only, CMD is overridden by docker-compose ───────────────────
FROM base AS dev
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    cd /app/frontend && pnpm install --frozen-lockfile
EXPOSE 3000

# ── Builder: install + compile Next.js ───────────────────────────────────────
FROM base AS builder
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    cd /app/frontend && pnpm install --frozen-lockfile
# Skip env validation — runtime vars are injected by nginx/container. A
# standalone build keeps the production image limited to traced runtime files.
RUN cd /app/frontend && SKIP_ENV_VALIDATION=1 SKIP_TS_CHECK=1 NEXT_CONFIG_BUILD_OUTPUT=standalone NODE_OPTIONS=--max-old-space-size=4096 pnpm exec next build --webpack

# ── Prod: minimal runtime with pre-built output ───────────────────────────────
FROM node:22-alpine AS prod
ARG RELEASE_CREATED=unknown
ARG RELEASE_REVISION=unknown
ARG RELEASE_SOURCE_DIGEST=unknown
LABEL org.opencontainers.image.created="${RELEASE_CREATED}" \
      org.opencontainers.image.revision="${RELEASE_REVISION}" \
      deerflow.release.source-digest="${RELEASE_SOURCE_DIGEST}"
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app/frontend
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static
COPY --from=builder /app/frontend/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

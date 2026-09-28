# RunRealm API image.
#
# One image, two roles. The roles are separate *processes* on purpose:
#
#   docker build -t runrealm-api .
#   docker run -p 3000:3000 runrealm-api                 # public API, no key
#   docker run -p 3001:3001 -e RUNREALM_ORACLE_PRIVATE_KEY=… \
#     runrealm-api node server/oracle.js                 # the signer
#
# The second command is the whole point of Phase 3. Before the split, the
# public API process held the quorum key in its environment next to an
# unauthenticated `POST /api/runs` under `Access-Control-Allow-Origin: *`.
# Now the key lives in a container whose only route is `/attestations/sign`.
#
# Targets: `api` (default) and `oracle`. They share the build and differ
# only in CMD, so the two deployments cannot drift apart by accident.

# ─── deps ────────────────────────────────────────────────────────────────────
# The server needs express, dotenv and ethers. It does not need the Next.js
# app, the contracts toolchain, or the mobile workspace, so this stage copies
# package manifests alone and installs only the runtime dependencies.
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ─── runtime ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# `node` already exists in the base image and the app is not a browser
# bundle, but `wget` is how compose health checks reach /healthz.
RUN apk add --no-cache wget

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY server ./server

# The ledger lives on a volume. `off` (memory only) is a valid choice for a
# throwaway environment and is documented in the env examples.
RUN mkdir -p /var/lib/runrealm && chown -R node:node /var/lib/runrealm /app
USER node

VOLUME ["/var/lib/runrealm"]

# Exposes both roles; only one is ever bound per container.
EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1

# ─── api: the public surface, and only the public surface ────────────────────
FROM runtime AS api
ENV PORT=3000
CMD ["node", "server.js"]

# ─── oracle: the quorum signer, and only the signer ──────────────────────────
FROM runtime AS oracle
ENV PORT=3001
CMD ["node", "server/oracle.js"]

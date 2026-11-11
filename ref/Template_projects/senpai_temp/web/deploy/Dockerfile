# SenpAI web for a linux/amd64 box. Built on the Mac, never on the server:
# `.next` comes from `npm run build` on the host (JavaScript only, NEXT_PUBLIC_* baked in),
# the image only installs the Linux production dependencies.
#   npm run build && docker buildx build --platform linux/amd64 -f deploy/Dockerfile -t senpai-web:<tag> --load .
FROM node:24-bookworm-slim AS deps
ARG TARGETARCH
WORKDIR /app
COPY package.json package-lock.json ./
# onnxruntime-node ships the CPU binaries; skip its optional CUDA download, keep only this arch.
RUN ONNXRUNTIME_NODE_INSTALL=skip npm ci --omit=dev --no-audit --no-fund \
 && cd node_modules/onnxruntime-node/bin/napi-v6 && rm -rf darwin win32 \
 && keep=$([ "$TARGETARCH" = arm64 ] && echo arm64 || echo x64) && for d in linux/*; do [ "$d" = "linux/$keep" ] || rm -rf "$d"; done \
 && npm cache clean --force

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    DB_PATH=/app/data/senpai.db PRON_MODEL_DIR=/app/models
COPY --from=deps /app/node_modules ./node_modules
COPY package.json next.config.ts ./
COPY .next ./.next
# Loaded by path at runtime, outside the bundle.
COPY lib/pron-worker.mjs ./lib/
RUN mkdir -p data models && chown node:node data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=15s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node_modules/.bin/next", "start"]

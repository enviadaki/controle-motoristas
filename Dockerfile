# syntax=docker/dockerfile:1.7
# Imagem única: a API Express serve também o frontend React já compilado.
# A API é empacotada pelo esbuild num bundle sem dependências externas,
# então a imagem final não precisa de node_modules.

FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json server/
COPY client/package.json client/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter ./client run build && pnpm --filter ./server run build

FROM node:22-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5000 \
    FRONTEND_DIR=/app/public \
    MIGRATIONS_DIR=/app/drizzle
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/drizzle ./drizzle
COPY --from=build /app/client/dist ./public
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]

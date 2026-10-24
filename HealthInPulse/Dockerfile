# syntax=docker/dockerfile:1
# Imagem única da demo: o backend serve a API, o Socket.io e o build do frontend
# na mesma porta. Usada pelo docker compose e pelo deploy grátis (Render).

FROM node:20-bookworm-slim AS base
# O Prisma escolhe o engine pela versão do OpenSSL; a imagem slim não traz.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ─── frontend: build estático ────────────────────────────────
FROM base AS frontend
COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm ci --prefix frontend --no-audit --no-fund
COPY frontend frontend
RUN npm run build --prefix frontend

# ─── backend: dependências + Prisma Client ───────────────────
FROM base AS backend
COPY backend/package.json backend/package-lock.json backend/
# Inclui devDependencies: o CLI do Prisma roda o `db push` no start
RUN npm ci --prefix backend --no-audit --no-fund
COPY backend backend
RUN cd backend && npx --no-install prisma generate

# ─── runtime ─────────────────────────────────────────────────
FROM base
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/healthinpulse.db

COPY --from=backend  --chown=node:node /app/backend        backend
COPY --from=frontend --chown=node:node /app/frontend/dist  frontend/dist
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh
# Clone feito no Windows pode trazer o script com CRLF ("exec format error")
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
 && mkdir -p /data && chown node:node /data

USER node
WORKDIR /app/backend
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "src/server.js"]

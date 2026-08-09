# --- Etapa de Build ---
FROM node:lts-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json .
RUN npm ci
COPY tsconfig.json .
COPY src ./src
RUN npm run build

# --- Etapa de Runner ---
FROM node:lts-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# --chown entrega o arquivo já com o usuario "node" (nao-root) como dono, senao writeDatabase() falha com EACCES
COPY --chown=node:node data ./data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "dist/server.js"]
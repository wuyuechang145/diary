FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

LABEL org.opencontainers.image.title="星笺" \
      org.opencontainers.image.description="Nuxt SSR 3D 家庭共鸣日记"

COPY --from=build --chown=node:node /app/.output ./.output
COPY --chown=node:node scripts/migrate-database.mjs ./scripts/migrate-database.mjs
COPY --chown=node:node scripts/init-docker-secrets.mjs ./scripts/init-docker-secrets.mjs
RUN ln -s /app/.output/server/node_modules /app/node_modules

USER node

EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]

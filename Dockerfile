# Production image: BOTH Next.js apps (website + CMS, and the CRM app) + a bundled migration runner. Same image for staging and
# production; only the environment variables differ (see DEPLOY.md). Which app a container runs is chosen by its command:
# start-web (the default "start"), start-crm, or migrate. Build: docker build -t apex .
FROM node:26-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# Node 25+ no longer ships corepack, so pnpm is installed explicitly (same version as package.json "packageManager").
RUN npm install -g pnpm@10.34.6
WORKDIR /app

# 1) dependencies (cached until the lockfile changes)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/crm/package.json apps/crm/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY packages/forms/package.json packages/forms/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# 2) build (needs no database: pages are generated on first visit)
FROM deps AS build
COPY . .
ENV NEXT_STANDALONE=1
RUN pnpm --filter web build \
 && pnpm --filter crm build \
 && pnpm --filter web exec esbuild db/migrate.mts --bundle --platform=node --format=esm --outfile=/app/migrate.mjs

# 3) runtime: only what is needed to run
FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# Each standalone output carries its own traced node_modules; copied over each other they merge into one shared set.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/crm/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/crm/.next/static ./apps/crm/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/migrate.mjs ./migrate.mjs
COPY db/migrations ./db/migrations
COPY db/grants.sql ./db/grants.sql
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["start"]

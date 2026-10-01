# Production image: self-contained Next.js server + a bundled migration runner. Same image for staging and production;
# only the environment variables differ (see DEPLOY.md). Build: docker build -t apex .
FROM node:26-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# 1) dependencies (cached until the lockfile changes)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
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
 && pnpm --filter web exec esbuild db/migrate.mts --bundle --platform=node --format=esm --outfile=/app/migrate.mjs

# 3) runtime: only what is needed to run
FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/migrate.mjs ./migrate.mjs
COPY db/migrations ./db/migrations
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["start"]

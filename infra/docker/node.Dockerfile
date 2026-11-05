# syntax=docker/dockerfile:1.7
# Generic image for the Node services (api, worker). Usage:
#   docker build -f infra/docker/node.Dockerfile --build-arg APP=api -t jobia-api .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG APP
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @jobia/${APP} build \
 && pnpm --filter @jobia/${APP} deploy --prod --legacy /out \
 && cp -r apps/${APP}/dist /out/dist

# ---- api: small distroless-like runtime ----
FROM node:${NODE_VERSION}-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 4000
CMD ["node", "--enable-source-maps", "dist/main.js"]

# ---- worker: includes Chromium for the browser queues ----
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
USER pwuser
CMD ["node", "--enable-source-maps", "dist/main.js"]

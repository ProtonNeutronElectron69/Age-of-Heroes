# Age of Heroes game server.
# Build from the repository root:  docker build -f apps/server/Dockerfile -t age-of-heroes-server .

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
COPY apps/client/package.json ./apps/client/package.json
RUN pnpm install --frozen-lockfile --filter "@aoh/server..."
RUN pnpm --filter @aoh/server build

# The bundle has no runtime dependencies, so the final image is just Node and one file.
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/apps/server/dist/index.js ./index.js
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "index.js"]

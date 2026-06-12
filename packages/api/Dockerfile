FROM node:20-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml* ./
COPY packages/api/package.json ./packages/api/
RUN pnpm install --filter api --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY tsconfig.base.json ./
COPY packages/api ./packages/api
RUN pnpm --filter api build

FROM node:20-alpine AS runner
WORKDIR /app
RUN mkdir -p data
COPY --from=build /app/packages/api/dist ./dist
COPY --from=build /app/packages/api/node_modules ./node_modules
CMD ["node", "dist/index.js"]

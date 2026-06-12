FROM node:20-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml* ./
COPY packages/bot/package.json ./packages/bot/
RUN pnpm install --filter bot --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/bot/node_modules ./packages/bot/node_modules
COPY tsconfig.base.json ./
COPY packages/bot ./packages/bot
RUN pnpm --filter bot build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=build /app/packages/bot/dist ./dist
COPY --from=build /app/packages/bot/node_modules ./node_modules
CMD ["node", "dist/index.js"]

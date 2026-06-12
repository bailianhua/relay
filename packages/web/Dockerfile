FROM node:20-alpine AS build
RUN npm install -g pnpm
WORKDIR /app

ARG VITE_DISCORD_CLIENT_ID
ARG VITE_REDIRECT_URI=http://localhost/auth/callback

ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID
ENV VITE_REDIRECT_URI=$VITE_REDIRECT_URI

COPY package.json pnpm-workspace.yaml* ./
COPY packages/api/package.json ./packages/api/
COPY packages/bot/package.json ./packages/bot/
COPY packages/web/package.json ./packages/web/
RUN pnpm install --shamefully-hoist --ignore-scripts

COPY tsconfig.base.json ./
COPY packages/web ./packages/web
RUN pnpm --filter web build

FROM nginx:alpine
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

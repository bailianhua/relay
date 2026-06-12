FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ffmpeg && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml* ./
COPY packages/api/package.json ./packages/api/
COPY packages/bot/package.json ./packages/bot/
COPY packages/web/package.json ./packages/web/
RUN pnpm install

COPY tsconfig.base.json ./
COPY packages/api ./packages/api
RUN pnpm --filter api build

RUN mkdir -p data
EXPOSE 3001
CMD ["node", "packages/api/dist/index.js"]

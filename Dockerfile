FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies required for native better-sqlite3 module
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production runtime stage
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/contacts.sqlite
ENV JSON_BACKUP_PATH=/app/data/contacts.backup.json

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]

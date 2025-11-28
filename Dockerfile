# Use official Node.js runtime
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies separately to leverage Docker layer caching.
# Skip lifecycle scripts here so the "prepare" build step doesn't run before sources are copied.
COPY package*.json ./
RUN npm ci --ignore-scripts

# Build the TypeScript sources
COPY . .
RUN npm run build

# Prune dev dependencies to keep the final image small
RUN npm prune --omit=dev

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/http-server.js"]

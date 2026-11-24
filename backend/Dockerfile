FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations

USER node
EXPOSE 8000
CMD ["node", "src/index.js"]

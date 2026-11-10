FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev
ENV PORT=3001 DB_PATH=/data/app.db
VOLUME /data
EXPOSE 3001
CMD ["node", "server/index.js"]

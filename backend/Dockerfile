# syntax=docker/dockerfile:1

# --- 1) Abhängigkeiten (mit Build-Werkzeugen, falls sqlite3 kompiliert werden muss) ---
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- 2) Laufzeit-Image (schlank, ohne Build-Werkzeuge, ohne Root-Rechte) ---
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=5000 \
    DB_STORAGE=/data/timetracking.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /data /backups && chown -R node:node /app /data /backups
USER node
VOLUME ["/data"]
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

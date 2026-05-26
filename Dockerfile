# ── Stage 1: instalar deps en Linux ─────────────────────────
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

# ── Stage 2: runtime final ───────────────────────────────────
FROM node:22-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma       ./prisma
COPY public                        ./public
COPY server.js                     ./server.js
COPY scripts                       ./scripts

EXPOSE 5013 3000

CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]

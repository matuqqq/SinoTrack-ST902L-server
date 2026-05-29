FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

FROM node:22-alpine
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

COPY public    ./public
COPY scripts   ./scripts
COPY lib       ./lib
COPY routes    ./routes
COPY middleware ./middleware
COPY jobs      ./jobs
COPY utils     ./utils
COPY server.js ./server.js
COPY swagger.js ./swagger.js

EXPOSE 5013 3000

CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]

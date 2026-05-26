FROM node:22 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

FROM node:22
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY public ./public
COPY server.js ./server.js
COPY scripts ./scripts
EXPOSE 5013 3000
CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]

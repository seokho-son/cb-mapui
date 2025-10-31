#############################################################
## Stage 1 - Build static files
#############################################################

FROM node:18-alpine AS builder

WORKDIR /app

COPY ./package.json ./package-lock.json ./

RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm install --silent --no-audit --prefer-offline

COPY . .

RUN npm run build

RUN npm prune --production

#############################################################
## Stage 2 - App
#############################################################

FROM node:18-alpine AS prod

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/img ./dist/img
COPY --from=builder /app/index.html ./
COPY --from=builder /app/index.js ./
COPY --from=builder /app/favicon.svg ./
COPY --from=builder /app/redoc-swagger.html ./
COPY --from=builder /app/swagger.html ./
COPY --from=builder /app/scalar.html ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/package.json ./package.json

EXPOSE 1324

ENTRYPOINT ["npm", "start"]

#############################################################
## Stage 1 - Build static files
#############################################################

FROM node:20-alpine AS builder

WORKDIR /app

# Copy only package files first for better caching
COPY ./package.json ./package-lock.json ./

# Install dependencies with optimized settings and BuildKit cache
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci --no-audit --prefer-offline

# Copy only necessary source files
COPY ./index.html ./
COPY ./index.js ./
COPY ./vite.config.js ./
COPY ./src ./src
COPY ./public ./public
COPY ./runtime-params.json ./

# Build with Vite
RUN npm run build

# Ensure dist directory exists (even if build failed)
RUN mkdir -p dist

# Prune dev dependencies
RUN npm prune --production

#############################################################
## Stage 2 - Production Runtime
#############################################################

FROM node:20-alpine AS prod

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/index.html ./
COPY --from=builder /app/index.js ./
COPY --from=builder /app/vite.config.js ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/runtime-params.json ./

# Copy dependencies and configs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

# Copy dist directory (created during build or as empty dir)
COPY --from=builder /app/dist ./dist

EXPOSE 1324

COPY ./docker-entrypoint.sh ./

# Entrypoint collects MAPUI_PARAM_* envs into runtime-params.json, then starts vite
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]

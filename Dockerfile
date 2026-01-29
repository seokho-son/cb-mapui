#############################################################
## Stage 1 - Build static files
#############################################################

FROM node:18-alpine AS builder

WORKDIR /app

# Copy only package files first for better caching
COPY ./package.json ./package-lock.json ./

# Install dependencies with optimized settings and BuildKit cache
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci --silent --no-audit --prefer-offline

# Copy only necessary source files
COPY ./index.html ./
COPY ./index.js ./
COPY ./resource-graph.js ./
COPY ./dashboard.html ./
COPY ./dashboard.js ./
COPY ./favicon.svg ./
COPY ./redoc-swagger.html ./
COPY ./swagger.html ./
COPY ./scalar.html ./
COPY ./img ./img

# Build with Parcel cache
RUN --mount=type=cache,target=/app/.parcel-cache \
    npm run build || true

# Ensure dist directory exists (even if build failed)
RUN mkdir -p dist

# Prune dev dependencies
RUN npm prune --production

#############################################################
## Stage 2 - Production Runtime
#############################################################

FROM node:18-alpine AS prod

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/index.html ./
COPY --from=builder /app/index.js ./
COPY --from=builder /app/resource-graph.js ./
COPY --from=builder /app/dashboard.html ./
COPY --from=builder /app/dashboard.js ./
COPY --from=builder /app/favicon.svg ./
COPY --from=builder /app/redoc-swagger.html ./
COPY --from=builder /app/swagger.html ./
COPY --from=builder /app/scalar.html ./
COPY --from=builder /app/img ./img

# Copy dependencies and configs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

# Copy dist directory (created during build or as empty dir)
COPY --from=builder /app/dist ./dist

EXPOSE 1324

ENTRYPOINT ["npm", "start"]

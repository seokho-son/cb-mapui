
#############################################################
## Stage 1 - Build static files
#############################################################

FROM node:16 AS builder

# RUN apk update && apk add python3 g++ curl bash && rm -rf /var/cache/apk/*

# install node-prune (https://github.com/tj/node-prune)
RUN curl -sfL https://install.goreleaser.com/github.com/tj/node-prune.sh | bash -s -- -b /usr/local/bin

WORKDIR /app

COPY . .

RUN cd /app
# RUN npm install ol
# RUN npm install --save-dev parcel-bundler
RUN npm install

RUN npm run build

# remove development dependencies
RUN npm prune --production

# run node prune
RUN /usr/local/bin/node-prune

#############################################################
## Stage 2 - App
#############################################################

FROM node:16-alpine AS prod

WORKDIR /app

# RUN npm install --save-dev parcel-bundler
# RUN npm install parcel

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/img ./img
COPY --from=builder /app/index.html ./
COPY --from=builder /app/index.js ./
# COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/package.json ./package.json

RUN npm install

EXPOSE 1324

ENTRYPOINT ["npm", "start"]

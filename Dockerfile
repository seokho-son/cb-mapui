#############################################################
## Stage 1 - Build static files
#############################################################

FROM node:16 AS builder

# node-prune (https://github.com/tj/node-prune)
# node-prune is a small tool to prune unnecessary files from 
# ./node_modules, such as markdown, typescript source files, and so on.
RUN wget https://github.com/tj/node-prune/releases/download/v1.0.1/node-prune_1.0.1_linux_amd64.tar.gz
RUN tar xf node-prune_1.0.1_linux_amd64.tar.gz
RUN mv node-prune /usr/local/bin/

WORKDIR /app

COPY ./img ./img
COPY ./index.html ./
COPY ./index.js ./
COPY ./package-lock.json ./
COPY ./package.json ./

RUN npm install

RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Run node-prune
RUN /usr/local/bin/node-prune


#############################################################
## Stage 2 - App
#############################################################

FROM node:16-alpine AS prod

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/img ./dist/img
COPY --from=builder /app/index.html ./
COPY --from=builder /app/index.js ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/package.json ./package.json

EXPOSE 1324

ENTRYPOINT ["npm", "start"]

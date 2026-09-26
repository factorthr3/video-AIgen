# BlackCell production image: web app + API + render pipeline in one process.
FROM node:24-bookworm-slim

# ffmpeg encodes videos; Noto fonts cover non-Latin captions (Hindi, Japanese,
# Korean, Chinese); espeak-ng is the last-resort offline voice.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg espeak-ng fontconfig fonts-noto-core fonts-noto-cjk ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Mount a persistent volume at /data (database, rendered videos, caches).
ENV NODE_ENV=production DATA_DIR=/data
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]

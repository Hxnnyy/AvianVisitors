FROM node:22-bookworm-slim
WORKDIR /srv/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/renderer ./renderer
COPY app/shared ./shared
COPY app/public ./public
ENV PORT=8082 PUBLIC_DIRECTORY=/srv/app/public
EXPOSE 8082
USER node
CMD ["npx", "tsx", "renderer/server.ts"]

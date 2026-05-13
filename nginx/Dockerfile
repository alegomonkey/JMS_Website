# Stage 1: build the React app
FROM node:20-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# Stage 2: nginx serves the built bundle
FROM nginx:1.27-alpine
RUN apk add --no-cache gettext
COPY nginx/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/entrypoint.sh /docker-entrypoint.d/40-render-conf.sh
RUN chmod +x /docker-entrypoint.d/40-render-conf.sh
COPY --from=web-build /web/dist /usr/share/nginx/html
EXPOSE 80 443

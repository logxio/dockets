FROM node:20-alpine AS build

WORKDIR /app
COPY . /app

RUN corepack enable && pnpm install --frozen-lockfile && pnpm run build

FROM nginx:1.25-alpine

COPY --from=build /app/dist/ /usr/share/nginx/html/

RUN cat >/etc/nginx/conf.d/default.conf <<'NGINX'
server {
  listen 80;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  location = /workbench {
    try_files /workbench.html =404;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
NGINX

EXPOSE 80

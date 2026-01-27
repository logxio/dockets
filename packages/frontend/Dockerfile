FROM node:20-alpine AS build

WORKDIR /app
COPY . /app

RUN set -e; \
    if [ -f package.json ]; then \
      if [ -f pnpm-lock.yaml ]; then \
        corepack enable; pnpm install --frozen-lockfile; pnpm run build; \
      elif [ -f yarn.lock ]; then \
        corepack enable; yarn install --frozen-lockfile; yarn build; \
      elif [ -f package-lock.json ]; then \
        npm ci; npm run build; \
      else \
        npm install; npm run build; \
      fi; \
      mkdir -p /out; \
      if [ -d dist ]; then cp -R dist/* /out/; \
      elif [ -d build ]; then cp -R build/* /out/; \
      else echo "Expected dist/ or build/ output directory" >&2; exit 1; fi; \
    else \
      mkdir -p /out; \
      printf '%s\n' '<!doctype html><html><head><meta charset=\"utf-8\" /><title>Frontend placeholder</title></head><body><h1>packages/frontend is empty</h1><p>Waiting for Agent D to migrate the frontend.</p></body></html>' > /out/index.html; \
    fi

FROM nginx:1.25-alpine

COPY --from=build /out/ /usr/share/nginx/html/

RUN cat >/etc/nginx/conf.d/default.conf <<'EOF'
server {
  listen 80;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

EXPOSE 80

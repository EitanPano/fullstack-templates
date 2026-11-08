FROM oven/bun:1.4-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Only the built files, for the server image to copy (single mode): no toolchain, no source.
FROM scratch AS dist
COPY --from=build /app/dist /dist

# The default target: the static server of the split mode.
FROM nginxinc/nginx-unprivileged:1.31.7-alpine AS serve
COPY nginx/default.conf /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
ENV PORT=__PORT__
EXPOSE __PORT__
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:${PORT}/ || exit 1

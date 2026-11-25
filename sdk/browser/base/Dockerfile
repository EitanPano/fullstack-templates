FROM oven/bun:1.4-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Only the built files, for the server image to copy: the loader, the frame's script and its
# document under v<major>/. No toolchain, no source, nothing to run.
FROM scratch AS dist
COPY --from=build /app/dist/cdn /sdk

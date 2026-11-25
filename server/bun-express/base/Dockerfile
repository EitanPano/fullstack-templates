FROM oven/bun:1.4-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json ./
COPY --chown=bun:bun src ./src
# @single-start
# The built SPA from the frontend's `dist` target, served when STATIC_DIR names it.
COPY --from=spa --chown=bun:bun /dist ./public
ENV STATIC_DIR=/app/public
# @single-end
# @sdk-start
# The SDK's CDN build from its build-only `dist` target (the `sdk` build context), served when
# SDK_DIR names it.
COPY --from=sdk --chown=bun:bun /sdk ./sdk
ENV SDK_DIR=/app/sdk
# @sdk-end
USER bun
EXPOSE 4000
CMD ["bun", "run", "src/index.ts"]

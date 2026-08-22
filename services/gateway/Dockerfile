FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Build
RUN bun build src/index.ts --target=bun --outdir=dist

FROM oven/bun:1-slim AS release
WORKDIR /app
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules

ENV PORT=8080
EXPOSE 8080

CMD ["bun", "dist/index.js"]

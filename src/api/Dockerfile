# Backend de ValorAuto (Bun + Express, ADR-0001). En Bun el acceso a SQLite es
# con `bun:sqlite` nativo, así que no hace falta compilar better-sqlite3
# (--ignore-scripts): solo se usaría como fallback si se corriera con Node.
FROM oven/bun:1.4.4

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile --ignore-scripts

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "index.js"]

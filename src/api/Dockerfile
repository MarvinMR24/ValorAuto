FROM node:20-alpine

WORKDIR /app

# Instalar dependencias necesarias para compilar better-sqlite3 si hiciera falta
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]

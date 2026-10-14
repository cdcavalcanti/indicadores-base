FROM node:22-alpine

WORKDIR /app

# Instala dependências primeiro (cache de camada)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Código
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
# schema.sql é montado em /db pelo docker-compose
ENV SCHEMA_PATH=/db/schema.sql

CMD ["npm", "start"]

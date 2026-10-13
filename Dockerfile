# Usa a imagem oficial do Puppeteer (já tem Chromium + dbus configurados)
FROM ghcr.io/puppeteer/puppeteer:latest

# Muda para root para instalar as dependências do nosso app
USER root

WORKDIR /app

# Copia e instala dependências do backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copia o código do backend e frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

EXPOSE 3000
CMD ["node", "backend/server.js"]

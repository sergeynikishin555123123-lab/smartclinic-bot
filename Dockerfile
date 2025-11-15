FROM node:18-alpine

WORKDIR /app

# Устанавливаем дополнительные утилиты для диагностики
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

COPY package*.json ./
RUN npm install --production

COPY . .

# Создаем директорию для логов
RUN mkdir -p /app/logs && chmod 755 /app/logs

EXPOSE 3000

# Запускаем с логированием в stdout
CMD ["npm", "start"]

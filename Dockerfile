FROM node:18-alpine

WORKDIR /app

# Копируем package.json сначала для кэширования зависимостей
COPY package*.json ./
RUN npm install --production

# Копируем исходный код
COPY . .

# Создаем не-root пользователя для безопасности
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
RUN chown -R nextjs:nodejs /app
USER nextjs

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "start"]

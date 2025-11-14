require('dotenv').config();
const express = require('express');
const { Telegraf, session } = require('telegraf');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// Импорт конфигурации и моделей
const { initDatabase } = require('./config/database');
const BotController = require('./controllers/botController');
const apiRoutes = require('./routes/api');
const webappRoutes = require('./routes/webapp');

console.log('🚀 SMART CLINIC BOT - ENTERPRISE EDITION');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Инициализация
async function initializeApp() {
  try {
    // Инициализация базы данных
    await initDatabase();
    console.log('✅ Database initialized');

    // Инициализация бота
    const botController = new BotController(bot);
    
    // Middleware бота
    bot.use(session());
    bot.use(async (ctx, next) => {
      if (ctx.from) {
        const User = require('./models/User');
        await User.createOrUpdate(ctx.from);
      }
      await next();
    });

    // Обработчики бота
    bot.start((ctx) => botController.handleStart(ctx));
    bot.hears('📱 Навигация', (ctx) => botController.handleNavigation(ctx));
    bot.hears('💳 Подписка', (ctx) => botController.handleSubscription(ctx));
    bot.hears('📅 Анонсы', (ctx) => botController.handleAnnouncements(ctx));
    bot.hears('🎁 Акции', (ctx) => botController.handlePromotions(ctx));
    bot.hears('🆘 Поддержка', (ctx) => botController.handleSupport(ctx));
    bot.hears('❓ Задать вопрос', (ctx) => botController.handleQuestion(ctx));

    // Обработка текстовых сообщений для онбординга
    bot.on('text', async (ctx) => {
      if (ctx.session?.step) {
        await botController.handleOnboarding(ctx, ctx.session);
      } else {
        await botController.showMainMenu(ctx);
      }
    });

    // WebApp маршруты
    app.use('/api', apiRoutes);
    app.use('/', webappRoutes);

    // Health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Smart Clinic - Enterprise Edition',
        version: '3.0.0'
      });
    });

    // Запуск сервера
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`✅ WebApp: ${process.env.WEBAPP_URL}/webapp`);
      console.log(`✅ Health: ${process.env.WEBAPP_URL}/health`);
    });

    // Запуск бота
    await bot.launch();
    console.log('✅ Bot started successfully');

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
}

// Запуск приложения
initializeApp();

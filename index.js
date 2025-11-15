require('dotenv').config();
const express = require('express');
const { Telegraf, session, Markup } = require('telegraf');
const { Pool } = require('pg');

// Настройка логирования
const logger = {
  info: (msg, data = {}) => {
    const timestamp = new Date().toISOString();
    console.log(JSON.stringify({
      timestamp,
      level: 'INFO',
      message: msg,
      ...data
    }));
  },
  error: (msg, error = {}) => {
    const timestamp = new Date().toISOString();
    console.error(JSON.stringify({
      timestamp,
      level: 'ERROR',
      message: msg,
      error: error.message,
      stack: error.stack
    }));
  },
  warn: (msg, data = {}) => {
    const timestamp = new Date().toISOString();
    console.warn(JSON.stringify({
      timestamp,
      level: 'WARN',
      message: msg,
      ...data
    }));
  }
};

logger.info('🚀 SMART CLINIC BOT - STARTING...', {
  node_version: process.version,
  platform: process.platform,
  environment: process.env.NODE_ENV || 'production'
});

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Логирование для бота
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const responseTime = Date.now() - start;
  
  logger.info('BOT_REQUEST', {
    update_id: ctx.update.update_id,
    user_id: ctx.from?.id,
    username: ctx.from?.username,
    message_type: ctx.message?.text ? 'text' : 'other',
    message_text: ctx.message?.text?.substring(0, 100),
    response_time: `${responseTime}ms`
  });
});

// База данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Логирование для базы данных
pool.on('connect', () => {
  logger.info('DATABASE_CONNECTED');
});

pool.on('error', (err) => {
  logger.error('DATABASE_ERROR', err);
});

// Простая инициализация БД
async function initDatabase() {
  try {
    logger.info('DATABASE_INIT_START');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    logger.info('DATABASE_INIT_SUCCESS');
    
    // Проверяем подключение
    const result = await pool.query('SELECT NOW() as time');
    logger.info('DATABASE_CONNECTION_TEST', { 
      database_time: result.rows[0].time 
    });
    
  } catch (error) {
    logger.error('DATABASE_INIT_FAILED', error);
    throw error;
  }
}

// Middleware с логированием
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP_REQUEST', {
      method: req.method,
      url: req.url,
      status_code: res.statusCode,
      duration: `${duration}ms`,
      user_agent: req.get('User-Agent')?.substring(0, 100),
      ip: req.ip
    });
  });
  
  next();
});

app.use(express.json());
app.use(express.static('public'));

// Health check с детальной информацией
app.get('/health', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT 1 as status');
    const botCheck = bot.telegram ? 'OK' : 'ERROR';
    
    const healthInfo = {
      status: 'OK',
      service: 'Smart Clinic Bot',
      timestamp: new Date().toISOString(),
      uptime: `${process.uptime()}s`,
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
      },
      checks: {
        database: dbCheck.rows[0].status === 1 ? 'OK' : 'ERROR',
        telegram_bot: botCheck,
        environment: process.env.NODE_ENV || 'production'
      }
    };
    
    logger.info('HEALTH_CHECK', healthInfo);
    res.json(healthInfo);
    
  } catch (error) {
    logger.error('HEALTH_CHECK_FAILED', error);
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// WebApp
app.get('/webapp', (req, res) => {
  logger.info('WEBAPP_ACCESS');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Smart Clinic</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .card { background: white; padding: 20px; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .btn { background: #667eea; color: white; padding: 12px 20px; border: none; border-radius: 8px; width: 100%; font-size: 16px; margin-top: 10px; cursor: pointer; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>📚 Smart Clinic</h1>
            <p>Ваша образовательная платформа</p>
            <p><strong>Статус:</strong> ✅ Система работает</p>
            <button class="btn" onclick="alert('WebApp работает!')">Тестовая кнопка</button>
        </div>
        <script>
            console.log('WebApp loaded successfully');
            let tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            console.log('Telegram WebApp initialized');
        </script>
    </body>
    </html>
  `);
});

// Бот
bot.use(session());

bot.start(async (ctx) => {
  logger.info('BOT_START_COMMAND', {
    user_id: ctx.from.id,
    username: ctx.from.username
  });
  
  await ctx.replyWithHTML(
    `👋 <b>Привет, ${ctx.from.first_name}!</b>\n\n` +
    `Добро пожаловать в <b>Smart Clinic</b>!\n\n` +
    `<b>Статус системы:</b> ✅ Работает\n` +
    `<b>Время:</b> ${new Date().toLocaleString('ru-RU')}`,
    Markup.keyboard([
      ['📱 WebApp', '💳 Подписка'],
      ['🆘 Помощь', '📊 Статус']
    ]).resize()
  );
});

bot.hears('📱 WebApp', async (ctx) => {
  const webappUrl = `${process.env.WEBAPP_URL}/webapp`;
  logger.info('WEBAPP_BUTTON_CLICK', { user_id: ctx.from.id });
  
  await ctx.reply(
    'Откройте WebApp для доступа к курсам:',
    Markup.inlineKeyboard([
      Markup.button.webApp('🚀 Открыть WebApp', webappUrl)
    ])
  );
});

bot.hears('📊 Статус', async (ctx) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  await ctx.replyWithHTML(
    `📊 <b>Статус системы</b>\n\n` +
    `✅ <b>Бот:</b> Активен\n` +
    `🕒 <b>Аптайм:</b> ${hours}ч ${minutes}м ${seconds}с\n` +
    `📅 <b>Время сервера:</b> ${new Date().toLocaleString('ru-RU')}\n` +
    `🌐 <b>WebApp:</b> Доступен`
  );
});

bot.hears('💳 Подписка', async (ctx) => {
  await ctx.reply(
    '💎 Премиум подписка\n\nДоступ ко всем курсам и материалам',
    Markup.inlineKeyboard([
      [Markup.button.callback('1 месяц - 990₽', 'subscribe_1')],
      [Markup.button.callback('3 месяца - 2490₽', 'subscribe_3')]
    ])
  );
});

bot.hears('🆘 Помощь', async (ctx) => {
  await ctx.reply('📧 Поддержка: support@smartclinic.ru');
});

// Обработка ошибок бота
bot.catch((error, ctx) => {
  logger.error('BOT_ERROR', {
    error: error,
    update: ctx.update
  });
});

// Обработка ошибок сервера
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT_EXCEPTION', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED_REJECTION', {
    reason: reason,
    promise: promise
  });
});

// Запуск
async function startServer() {
  try {
    logger.info('SERVER_START_INIT');
    
    await initDatabase();
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
      logger.info('SERVER_STARTED', {
        port: PORT,
        environment: process.env.NODE_ENV || 'production',
        webapp_url: process.env.WEBAPP_URL
      });
    });

    await bot.launch();
    logger.info('BOT_STARTED', {
      username: bot.botInfo?.username,
      id: bot.botInfo?.id
    });
    
    logger.info('SYSTEM_READY');
    
  } catch (error) {
    logger.error('STARTUP_FAILED', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.once('SIGINT', () => {
  logger.info('SHUTDOWN_SIGNAL', { signal: 'SIGINT' });
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  logger.info('SHUTDOWN_SIGNAL', { signal: 'SIGTERM' });
  bot.stop('SIGTERM');
});

startServer();

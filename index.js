require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');

console.log('🚀 STARTING SMART CLINIC BOT...');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// ==================== TELEGRAM BOT ====================

bot.start(async (ctx) => {
    console.log(`👤 User ${ctx.from.first_name} started bot`);
    
    await ctx.replyWithHTML(
        `👋 <b>Привет, ${ctx.from.first_name}!</b>\n\n` +
        `Добро пожаловать в <b>Smart Clinic</b>! 🎯\n\n` +
        `<b>Выбери действие:</b>`,
        Markup.keyboard([
            ['📱 Навигация', '🎁 Акции'],
            ['❓ Задать вопрос', '💳 Подписка'],
            ['📅 Анонсы', '🆘 Поддержка']
        ]).resize()
    );
});

bot.hears('📱 Навигация', async (ctx) => {
    console.log(`📍 User ${ctx.from.first_name} clicked Navigation`);
    
    // Получаем домен из переменных окружения или используем текущий
    const domain = process.env.WEBAPP_URL || `https://${process.env.TIMEWEB_DOMAIN}`;
    
    await ctx.replyWithHTML(
        '📚 <b>Навигация по контенту</b>\n\n' +
        'Открой мини-приложение для просмотра курсов:',
        Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Открыть Smart Clinic', `${domain}/webapp`)]
        ])
    );
});

bot.hears('💳 Подписка', async (ctx) => {
    await ctx.replyWithHTML(
        '💎 <b>Управление подпиской</b>\n\n' +
        '• 📊 <b>Статус:</b> Не активна\n' + 
        '• 🎯 <b>Доступно:</b> Базовый контент\n' +
        '• 🔥 <b>Премиум:</b> Курсы, разборы, эфиры\n\n' +
        '<b>Выбери период:</b>',
        Markup.inlineKeyboard([
            [Markup.button.callback('🔄 1 месяц - 990₽', 'subscribe_1')],
            [Markup.button.callback('📅 3 месяца - 2490₽', 'subscribe_3')],
            [Markup.button.callback('🎯 12 месяцев - 8990₽', 'subscribe_12')]
        ])
    );
});

bot.action(/subscribe_(\d+)/, async (ctx) => {
    const months = ctx.match[1];
    const prices = {1: 990, 3: 2490, 12: 8990};
    
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `✅ <b>Отличный выбор!</b>\n\n` +
        `Ты выбрал подписку на <b>${months} месяц(ев)</b>\n` +
        `Сумма: <b>${prices[months]}₽</b>\n\n` +
        `🚀 <i>Оплата будет настроена на следующем этапе</i>`
    );
});

bot.hears('🎁 Акции', async (ctx) => {
    await ctx.replyWithHTML(
        '🎁 <b>Горячие акции</b>\n\n' +
        '🔥 <b>Первый месяц со скидкой 20%</b>\n' +
        '   · Промокод: <code>SMART20</code>\n\n' +
        '👥 <b>Приведи друга</b>\n' +
        '   · Получи +1 месяц бесплатно\n\n' +
        '🎯 <b>Тестовый период</b>\n' +
        '   · Промокод: <code>TEST100</code>'
    );
});

bot.hears('📅 Анонсы', async (ctx) => {
    await ctx.replyWithHTML(
        '📅 <b>Ближайшие события</b>\n\n' +
        '• 🎤 <b>Вебинар:</b> Новые методики лечения\n' +
        '  📍 15 декабря, 19:00 МСК\n\n' +
        '• 📚 <b>Курс:</b> Профессиональный рост\n' +
        '  📍 Старт 20 декабря\n\n' +
        '• 👥 <b>Разбор кейсов</b>\n' +
        '  📍 Каждую среду, 18:00 МСК'
    );
});

bot.hears('🆘 Поддержка', async (ctx) => {
    await ctx.replyWithHTML(
        '🆘 <b>Техническая поддержка</b>\n\n' +
        'Если у тебя возникли вопросы:\n\n' +
        '• 📧 Напиши на <b>support@smartclinic.ru</b>\n' +
        '• 👨‍💻 Или свяжись с менеджером\n\n' +
        '<i>Мы ответим в течение 24 часов</i>',
        Markup.inlineKeyboard([
            [Markup.button.url('📨 Написать на почту', 'mailto:support@smartclinic.ru')]
        ])
    );
});

bot.hears('❓ Задать вопрос', async (ctx) => {
    await ctx.replyWithHTML(
        '❓ <b>Задай свой вопрос</b>\n\n' +
        'Напиши свой вопрос по обучению или курсам, и мы ответим в течение 24 часов.\n\n' +
        '<i>Просто напиши сообщение с вопросом...</i>'
    );
});

// Обработка ошибок бота
bot.catch((err) => {
    console.error('❌ Bot error:', err);
});

// ==================== WEB SERVER ====================

// Middleware для логирования запросов
app.use((req, res, next) => {
    console.log(`🌐 ${req.method} ${req.url}`);
    next();
});

// Главная страница
app.get('/', (req, res) => {
    console.log('✅ Home page accessed');
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Smart Clinic Bot</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    max-width: 800px; 
                    margin: 0 auto; 
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    min-height: 100vh;
                }
                .container { 
                    background: rgba(255,255,255,0.1); 
                    padding: 30px; 
                    border-radius: 15px; 
                    backdrop-filter: blur(10px);
                }
                h1 { text-align: center; margin-bottom: 10px; }
                .status { 
                    background: rgba(255,255,255,0.2); 
                    padding: 20px; 
                    border-radius: 10px; 
                    margin: 20px 0; 
                }
                .btn { 
                    display: inline-block; 
                    background: white; 
                    color: #667eea; 
                    padding: 12px 25px; 
                    border-radius: 25px; 
                    text-decoration: none; 
                    font-weight: bold; 
                    margin: 10px 5px; 
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎯 Smart Clinic Bot</h1>
                <p style="text-align: center; opacity: 0.9;">Образовательная платформа для профессионалов</p>
                
                <div class="status">
                    <h3>✅ СИСТЕМА РАБОТАЕТ НОРМАЛЬНО</h3>
                    <p><strong>🤖 Бот:</strong> ✅ Активен</p>
                    <p><strong>🌐 Веб-сервер:</strong> ✅ Работает</p>
                    <p><strong>🕐 Время:</strong> ${new Date().toLocaleString('ru-RU')}</p>
                    <p><strong>🔧 Статус:</strong> Все системы функционируют</p>
                </div>
                
                <div style="text-align: center;">
                    <a href="https://t.me/smart_clinic_test_bot" class="btn">🚀 Перейти в бота</a>
                    <a href="/webapp" class="btn">📱 WebApp</a>
                    <a href="/health" class="btn">❤️ Health Check</a>
                    <a href="/test" class="btn">🧪 Тест API</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Health check
app.get('/health', (req, res) => {
    console.log('❤️ Health check accessed');
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Smart Clinic Bot',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Test endpoint
app.get('/test', (req, res) => {
    console.log('🧪 Test endpoint accessed');
    res.json({ 
        message: '✅ Server is working!',
        time: new Date().toISOString()
    });
});

// WebApp
app.get('/webapp', (req, res) => {
    console.log('📱 WebApp accessed');
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Smart Clinic</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    margin: 0; 
                    padding: 20px; 
                    background: #f5f5f5; 
                }
                .header { 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    padding: 30px; 
                    text-align: center; 
                    border-radius: 15px;
                    margin-bottom: 20px;
                }
                .card { 
                    background: white; 
                    padding: 20px; 
                    border-radius: 12px; 
                    margin-bottom: 15px; 
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
                }
                .btn { 
                    background: #667eea; 
                    color: white; 
                    padding: 12px 20px; 
                    border: none; 
                    border-radius: 8px; 
                    width: 100%; 
                    font-size: 16px; 
                    margin-top: 10px; 
                    cursor: pointer;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📚 Smart Clinic</h1>
                <p>Ваша образовательная платформа</p>
                <p><small>Загружено: ${new Date().toLocaleString('ru-RU')}</small></p>
            </div>
            
            <div class="card">
                <h3>🔥 Популярные курсы</h3>
                <p>Добро пожаловать в каталог курсов Smart Clinic!</p>
            </div>
            
            <div class="card">
                <h4>🎯 Профессиональный рост</h4>
                <p>Методики развития карьеры и личностного роста</p>
                <button class="btn" onclick="alert('Курс открыт!')">Смотреть курс</button>
            </div>
            
            <div class="card">
                <h4>💼 Управление практикой</h4>
                <p>Эффективное ведение клиентов и управление бизнесом</p>
                <button class="btn" onclick="alert('Курс открыт!')">Смотреть курс</button>
            </div>
            
            <script>
                console.log('✅ Telegram WebApp initialized');
                Telegram.WebApp.ready();
                Telegram.WebApp.expand();
                Telegram.WebApp.enableClosingConfirmation();
            </script>
        </body>
        </html>
    `);
});

// Обработка 404
app.use((req, res) => {
    console.log(`❌ 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>404 - Not Found</title></head>
        <body>
            <h1>❌ 404 - Страница не найдена</h1>
            <p>Запрошенный URL: ${req.url}</p>
            <p><a href="/">Вернуться на главную</a></p>
        </body>
        </html>
    `);
});

// ==================== ЗАПУСК СЕРВЕРА ====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server started on port ${PORT}`);
    console.log(`✅ Home page: http://0.0.0.0:${PORT}`);
    console.log(`✅ Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`✅ WebApp: http://0.0.0.0:${PORT}/webapp`);
});

// Запуск бота
bot.launch().then(() => {
    console.log('✅ Bot started successfully!');
    console.log('🎉 Application is fully operational!');
}).catch(err => {
    console.error('❌ Bot startup failed:', err);
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

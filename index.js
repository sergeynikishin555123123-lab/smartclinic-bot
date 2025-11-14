require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { Pool } = require('pg');

// Детальное логирование запуска
console.log('🔧 ========== SMART CLINIC BOT STARTING ==========');
console.log('📅 Started at:', new Date().toISOString());
console.log('🌐 Node version:', process.version);
console.log('🔑 Environment variables check:');
console.log('   - BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ SET' : '❌ MISSING');
console.log('   - DATABASE_URL:', process.env.DATABASE_URL ? '✅ SET' : '❌ MISSING');
console.log('   - PORT:', process.env.PORT || 3000);

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Тест базы данных
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Функция проверки базы данных
async function testDatabase() {
    try {
        console.log('🔄 Testing database connection...');
        const result = await pool.query('SELECT NOW() as time');
        console.log('✅ Database connected successfully:', result.rows[0].time);
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

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
    
    await ctx.replyWithHTML(
        '📚 <b>Навигация по контенту</b>\n\n' +
        'Открой мини-приложение для просмотра курсов:',
        Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Открыть Smart Clinic', `https://${process.env.WEBAPP_URL || 'localhost'}/webapp`)]
        ])
    );
});

bot.hears('🆘 Поддержка', async (ctx) => {
    console.log(`🆘 User ${ctx.from.first_name} clicked Support`);
    
    await ctx.replyWithHTML(
        '🆘 <b>Техническая поддержка</b>\n\n' +
        '📧 Email: <b>support@smartclinic.ru</b>\n\n' +
        '<i>Мы ответим в течение 24 часов</i>'
    );
});

// Обработка ошибок бота
bot.catch((err) => {
    console.error('❌ Bot error:', err);
});

// ==================== WEB SERVER ====================

app.get('/', async (req, res) => {
    console.log('🌐 Home page accessed');
    const dbStatus = await testDatabase();
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Smart Clinic Bot</title>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                .status { padding: 20px; border-radius: 10px; margin: 20px 0; }
                .success { background: #d4edda; color: #155724; }
                .error { background: #f8d7da; color: #721c24; }
            </style>
        </head>
        <body>
            <h1>🎯 Smart Clinic Bot - STATUS</h1>
            <div class="status ${dbStatus ? 'success' : 'error'}">
                <h3>${dbStatus ? '✅ СИСТЕМА РАБОТАЕТ' : '❌ ОШИБКА СИСТЕМЫ'}</h3>
                <p><strong>Время сервера:</strong> ${new Date().toLocaleString('ru-RU')}</p>
                <p><strong>База данных:</strong> ${dbStatus ? '✅ Подключена' : '❌ Ошибка подключения'}</p>
                <p><strong>Бот:</strong> ✅ Активен</p>
                <p><strong>Веб-сервер:</strong> ✅ Работает</p>
            </div>
            <p><a href="/webapp">📱 Открыть WebApp</a></p>
            <p><a href="/health">❤️ Проверить здоровье системы</a></p>
        </body>
        </html>
    `);
});

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
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 15px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📚 Smart Clinic WebApp</h1>
                <p>Загружено успешно! ✅</p>
                <p><small>${new Date().toLocaleString('ru-RU')}</small></p>
            </div>
            <script>
                console.log('✅ Telegram WebApp loaded');
                Telegram.WebApp.ready();
                Telegram.WebApp.expand();
            </script>
        </body>
        </html>
    `);
});

// ==================== ЗАПУСК СЕРВЕРА ====================

async function startServer() {
    console.log('🔄 Testing database before startup...');
    const dbOk = await testDatabase();
    
    if (!dbOk) {
        console.log('⚠️ Starting without database...');
    }

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server started on port ${PORT}`);
        console.log(`✅ Health check: http://localhost:${PORT}/health`);
        console.log(`✅ WebApp: http://localhost:${PORT}/webapp`);
    });

    // Запуск бота
    try {
        await bot.launch();
        console.log('✅ Bot started successfully!');
        console.log('🎉 Application is fully operational!');
    } catch (error) {
        console.error('❌ Bot startup failed:', error);
    }
}

// Обработка ошибок
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Запуск приложения
startServer();

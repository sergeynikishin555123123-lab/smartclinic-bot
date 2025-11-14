require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { Pool } = require('pg');

console.log('🚀 STARTING SMART CLINIC BOT...');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// База данных
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Создание таблиц
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS user_questions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                question TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Database initialized');
    } catch (error) {
        console.error('❌ Database error:', error);
    }
}

// Сохранение пользователя
async function saveUser(telegramUser) {
    try {
        await pool.query(
            `INSERT INTO users (telegram_id, username, first_name, last_name)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (telegram_id) DO NOTHING`,
            [telegramUser.id, telegramUser.username, telegramUser.first_name, telegramUser.last_name]
        );
    } catch (error) {
        console.error('❌ Error saving user:', error);
    }
}

// ==================== TELEGRAM BOT ====================

// Команда /start
bot.start(async (ctx) => {
    await saveUser(ctx.from);
    
    await ctx.replyWithHTML(
        `👋 <b>Привет, ${ctx.from.first_name}!</b>\n\n` +
        `Добро пожаловать в <b>Smart Clinic</b> — твоего помощника в профессиональном развитии! 🎯\n\n` +
        `<b>Выбери действие:</b>`,
        Markup.keyboard([
            ['📱 Навигация', '🎁 Акции'],
            ['❓ Задать вопрос', '💳 Подписка'],
            ['📅 Анонсы', '🆘 Поддержка']
        ]).resize()
    );
    
    console.log(`✅ User ${ctx.from.first_name} started bot`);
});

// Кнопка "Навигация"
bot.hears('📱 Навигация', async (ctx) => {
    await ctx.replyWithHTML(
        '📚 <b>Навигация по контенту</b>\n\n' +
        'Открой мини-приложение для просмотра курсов:',
        Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Открыть Smart Clinic', `${process.env.WEBAPP_URL}/webapp`)]
        ])
    );
});

// Кнопка "Подписка"
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

// Обработка подписки
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

// Кнопка "Акции"
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

// Кнопка "Анонсы"
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

// Кнопка "Поддержка"
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

// Кнопка "Задать вопрос"
bot.hears('❓ Задать вопрос', async (ctx) => {
    await ctx.replyWithHTML(
        '❓ <b>Задай свой вопрос</b>\n\n' +
        'Напиши свой вопрос по обучению или курсам, и мы ответим в течение 24 часов.\n\n' +
        '<i>Просто напиши сообщение с вопросом...</i>'
    );
});

// Обработка вопросов
bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    
    const menuItems = ['📱 Навигация', '🎁 Акции', '❓ Задать вопрос', '💳 Подписка', '📅 Анонсы', '🆘 Поддержка'];
    
    if (!menuItems.includes(ctx.message.text)) {
        try {
            await pool.query(
                'INSERT INTO user_questions (user_id, question) VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2)',
                [ctx.from.id, ctx.message.text]
            );
            
            await ctx.replyWithHTML(
                '✅ <b>Вопрос получен!</b>\n\n' +
                'Мы получили твой вопрос и ответим в течение 24 часов.\n\n' +
                '<i>Спасибо за обращение! 🚀</i>'
            );
        } catch (error) {
            // Игнорируем ошибки
        }
    }
});

// Обработка ошибок бота
bot.catch((err) => {
    console.error('❌ Bot error:', err);
});

// ==================== WEB SERVER ====================

// Главная страница
app.get('/', async (req, res) => {
    try {
        const users = await pool.query('SELECT COUNT(*) as count FROM users');
        const questions = await pool.query('SELECT COUNT(*) as count FROM user_questions');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Smart Clinic Bot</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
                    .container { background: rgba(255,255,255,0.1); padding: 30px; border-radius: 15px; }
                    h1 { text-align: center; }
                    .status { background: rgba(255,255,255,0.2); padding: 20px; border-radius: 10px; margin: 20px 0; }
                    .btn { display: inline-block; background: white; color: #667eea; padding: 12px 25px; border-radius: 25px; text-decoration: none; font-weight: bold; margin: 10px 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎯 Smart Clinic Bot</h1>
                    <p style="text-align: center;">Образовательная платформа для профессионалов</p>
                    
                    <div class="status">
                        <h3>✅ Система работает нормально</h3>
                        <p><strong>👥 Пользователей:</strong> ${users.rows[0].count}</p>
                        <p><strong>❓ Вопросов:</strong> ${questions.rows[0].count}</p>
                        <p><strong>🤖 Бот:</strong> ✅ Активен</p>
                        <p><strong>🌐 Сервер:</strong> ✅ Работает</p>
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="https://t.me/smart_clinic_test_bot" class="btn">🚀 Перейти в бота</a>
                        <a href="/webapp" class="btn">📱 WebApp</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.send('Smart Clinic Bot - Status OK');
    }
});

// WebApp
app.get('/webapp', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Smart Clinic</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <script src="https://telegram.org/js/telegram-web-app.js"></script>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 15px; margin-bottom: 20px; }
                .card { background: white; padding: 20px; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .btn { background: #667eea; color: white; padding: 12px 20px; border: none; border-radius: 8px; width: 100%; font-size: 16px; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📚 Smart Clinic</h1>
                <p>Ваша образовательная платформа</p>
            </div>
            
            <div class="card">
                <h3>🔥 Популярные курсы</h3>
                <p>Добро пожаловать в каталог курсов Smart Clinic!</p>
            </div>
            
            <div class="card">
                <h4>🎯 Профессиональный рост</h4>
                <p>Методики развития карьеры и личностного роста</p>
                <button class="btn">Смотреть курс</button>
            </div>
            
            <div class="card">
                <h4>💼 Управление практикой</h4>
                <p>Эффективное ведение клиентов и управление бизнесом</p>
                <button class="btn">Смотреть курс</button>
            </div>
            
            <script>
                Telegram.WebApp.ready();
                Telegram.WebApp.expand();
                console.log('✅ WebApp loaded successfully');
            </script>
        </body>
        </html>
    `);
});

// Запуск сервера
async function startServer() {
    await initDatabase();
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server started on port ${PORT}`);
    });
    
    // Запуск бота
    bot.launch().then(() => {
        console.log('✅ Bot started successfully');
    }).catch(err => {
        console.error('❌ Bot start failed:', err);
    });
}

startServer();

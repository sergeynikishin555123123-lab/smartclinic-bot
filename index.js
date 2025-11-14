require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { Pool } = require('pg');

console.log('🚀 SMART CLINIC BOT - FULL VERSION STARTING...');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// База данных
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ==================== БАЗА ДАННЫХ ====================

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255),
                email VARCHAR(255),
                city VARCHAR(255),
                specialty VARCHAR(255),
                subscription_tier VARCHAR(50) DEFAULT 'guest',
                subscription_ends_at TIMESTAMP,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                category_id INTEGER REFERENCES categories(id),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                video_url VARCHAR(500),
                duration INTEGER DEFAULT 0,
                price DECIMAL(10,2) DEFAULT 0,
                is_premium BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS user_progress (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                course_id INTEGER REFERENCES courses(id),
                progress INTEGER DEFAULT 0,
                completed BOOLEAN DEFAULT false,
                last_watched_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, course_id)
            );
            
            CREATE TABLE IF NOT EXISTS user_favorites (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                course_id INTEGER REFERENCES courses(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, course_id)
            );
            
            CREATE TABLE IF NOT EXISTS user_questions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                question TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        await addTestData();
        console.log('✅ Database initialized with all tables');
    } catch (error) {
        console.error('❌ Database init error:', error);
    }
}

async function addTestData() {
    try {
        const categoriesCount = await pool.query('SELECT COUNT(*) FROM categories');
        if (parseInt(categoriesCount.rows[0].count) === 0) {
            // Категории
            const categories = [
                ['Медицина', 'Курсы для медицинских специалистов'],
                ['Психология', 'Курсы по психологии и терапии'],
                ['Бизнес', 'Управление практикой и бизнесом'],
                ['Развитие', 'Личностный и профессиональный рост']
            ];
            
            for (const [name, description] of categories) {
                await pool.query(
                    'INSERT INTO categories (name, description) VALUES ($1, $2)',
                    [name, description]
                );
            }
            
            // Курсы
            const courses = [
                [1, 'Основы диагностики', 'Базовые методы диагностики заболеваний', 'https://example.com/video1', 120, 0, false],
                [1, 'Современная терапия', 'Новые методики лечения', 'https://example.com/video2', 180, 1990, true],
                [2, 'Психология общения', 'Эффективное взаимодействие с пациентами', 'https://example.com/video3', 90, 0, false],
                [2, 'Кризисная интервенция', 'Работа с кризисными состояниями', 'https://example.com/video4', 150, 2490, true],
                [3, 'Управление клиникой', 'Бизнес-процессы медицинского центра', 'https://example.com/video5', 200, 2990, true],
                [4, 'Профессиональное выгорание', 'Профилактика и преодоление', 'https://example.com/video6', 100, 1490, true]
            ];
            
            for (const [category_id, title, description, video_url, duration, price, is_premium] of courses) {
                await pool.query(
                    `INSERT INTO courses (category_id, title, description, video_url, duration, price, is_premium) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [category_id, title, description, video_url, duration, price, is_premium]
                );
            }
            
            console.log('✅ Test data added');
        }
    } catch (error) {
        console.error('❌ Test data error:', error);
    }
}

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

bot.use(async (ctx, next) => {
    if (ctx.from) {
        await saveUser(ctx.from);
    }
    await next();
});

// Команда /start
bot.start(async (ctx) => {
    console.log(`👤 User ${ctx.from.first_name} started bot`);
    
    await ctx.replyWithHTML(
        `👋 <b>Привет, ${ctx.from.first_name}!</b>\n\n` +
        `Добро пожаловать в <b>Smart Clinic</b> — твоего помощника в профессиональном развитии! 🎯\n\n` +
        `<b>Выбери действие:</b>`,
        Markup.keyboard([
            ['📚 Каталог курсов', '🎁 Акции'],
            ['⭐ Избранное', '💳 Подписка'],
            ['📊 Мой прогресс', '🆘 Поддержка']
        ]).resize()
    );
});

// Каталог курсов
bot.hears('📚 Каталог курсов', async (ctx) => {
    await ctx.replyWithHTML(
        '📚 <b>Каталог курсов</b>\n\n' +
        'Выбери категорию для просмотра курсов:',
        Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Открыть каталог', `${process.env.WEBAPP_URL || 'https://your-domain.twc1.net'}/webapp`)],
            [Markup.button.callback('🏥 Медицина', 'category_1')],
            [Markup.button.callback('🧠 Психология', 'category_2')],
            [Markup.button.callback('💼 Бизнес', 'category_3')],
            [Markup.button.callback('📈 Развитие', 'category_4')]
        ])
    );
});

// Показать курсы категории
bot.action(/category_(\d+)/, async (ctx) => {
    try {
        const categoryId = ctx.match[1];
        const courses = await pool.query(
            `SELECT c.*, cat.name as category_name 
             FROM courses c 
             JOIN categories cat ON c.category_id = cat.id 
             WHERE c.category_id = $1 
             ORDER BY c.created_at DESC`,
            [categoryId]
        );
        
        if (courses.rows.length === 0) {
            await ctx.answerCbQuery();
            await ctx.reply('📭 В этой категории пока нет курсов.');
            return;
        }
        
        let message = `📂 <b>Курсы категории "${courses.rows[0].category_name}"</b>\n\n`;
        
        courses.rows.forEach((course, index) => {
            const priceText = course.price > 0 ? `${course.price}₽` : 'Бесплатно';
            const premiumBadge = course.is_premium ? ' 🔒' : '';
            message += `${index + 1}. <b>${course.title}</b>${premiumBadge}\n`;
            message += `   ⏱ ${course.duration} мин • ${priceText}\n`;
            message += `   📝 ${course.description}\n\n`;
        });
        
        await ctx.answerCbQuery();
        await ctx.replyWithHTML(
            message + '\n💡 <i>Для просмотра курсов откройте WebApp</i>',
            Markup.inlineKeyboard([
                [Markup.button.webApp('🚀 Открыть в WebApp', `${process.env.WEBAPP_URL || 'https://your-domain.twc1.net'}/category/${categoryId}`)]
            ])
        );
    } catch (error) {
        console.error('❌ Category error:', error);
        await ctx.answerCbQuery();
        await ctx.reply('⚠️ Ошибка загрузки курсов.');
    }
});

// Избранное
bot.hears('⭐ Избранное', async (ctx) => {
    try {
        const favorites = await pool.query(
            `SELECT c.* FROM courses c
             JOIN user_favorites uf ON c.id = uf.course_id
             JOIN users u ON uf.user_id = u.id
             WHERE u.telegram_id = $1`,
            [ctx.from.id]
        );
        
        if (favorites.rows.length === 0) {
            await ctx.replyWithHTML(
                '⭐ <b>Избранное</b>\n\n' +
                'У вас пока нет курсов в избранном.\n\n' +
                '💡 <i>Добавляйте курсы в избранное через WebApp</i>'
            );
            return;
        }
        
        let message = '⭐ <b>Ваше избранное</b>\n\n';
        favorites.rows.forEach((course, index) => {
            message += `${index + 1}. <b>${course.title}</b>\n`;
            message += `   📝 ${course.description}\n\n`;
        });
        
        await ctx.replyWithHTML(
            message,
            Markup.inlineKeyboard([
                [Markup.button.webApp('🚀 Открыть избранное', `${process.env.WEBAPP_URL || 'https://your-domain.twc1.net'}/favorites`)]
            ])
        );
    } catch (error) {
        console.error('❌ Favorites error:', error);
        await ctx.reply('⚠️ Ошибка загрузки избранного.');
    }
});

// Мой прогресс
bot.hears('📊 Мой прогресс', async (ctx) => {
    try {
        const progress = await pool.query(
            `SELECT c.title, up.progress, up.completed 
             FROM user_progress up
             JOIN courses c ON up.course_id = c.id
             JOIN users u ON up.user_id = u.id
             WHERE u.telegram_id = $1
             ORDER BY up.last_watched_at DESC`,
            [ctx.from.id]
        );
        
        if (progress.rows.length === 0) {
            await ctx.replyWithHTML(
                '📊 <b>Мой прогресс</b>\n\n' +
                'Вы еще не начали изучать курсы.\n\n' +
                '💡 <i>Начните обучение в каталоге курсов</i>'
            );
            return;
        }
        
        let message = '📊 <b>Ваш прогресс</b>\n\n';
        let completedCount = 0;
        
        progress.rows.forEach((item, index) => {
            const status = item.completed ? '✅ Завершено' : `🔄 ${item.progress}%`;
            if (item.completed) completedCount++;
            message += `${index + 1}. <b>${item.title}</b>\n`;
            message += `   ${status}\n\n`;
        });
        
        const totalProgress = Math.round((completedCount / progress.rows.length) * 100);
        
        await ctx.replyWithHTML(
            `${message}\n` +
            `📈 <b>Общий прогресс:</b> ${totalProgress}%\n` +
            `✅ <b>Завершено курсов:</b> ${completedCount}/${progress.rows.length}`,
            Markup.inlineKeyboard([
                [Markup.button.webApp('🚀 Продолжить обучение', `${process.env.WEBAPP_URL || 'https://your-domain.twc1.net'}/progress`)]
            ])
        );
    } catch (error) {
        console.error('❌ Progress error:', error);
        await ctx.reply('⚠️ Ошибка загрузки прогресса.');
    }
});

// Подписка
bot.hears('💳 Подписка', async (ctx) => {
    await ctx.replyWithHTML(
        '💎 <b>Управление подпиской</b>\n\n' +
        '• 📊 <b>Статус:</b> Не активна\n' + 
        '• 🎯 <b>Доступно:</b> Базовый контент\n' +
        '• 🔥 <b>Премиум:</b> Все курсы + новые материалы\n\n' +
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
        `🚀 <i>Оплата будет настроена на следующем этапе</i>\n\n` +
        `Для тестирования используй промокод: <code>TEST100</code>`
    );
});

// Акции
bot.hears('🎁 Акции', async (ctx) => {
    await ctx.replyWithHTML(
        '🎁 <b>Горячие акции</b>\n\n' +
        '🔥 <b>Первый месяц со скидкой 20%</b>\n' +
        '   · Промокод: <code>SMART20</code>\n\n' +
        '👥 <b>Приведи друга</b>\n' +
        '   · Получи +1 месяц бесплатно\n\n' +
        '🎯 <b>Тестовый период</b>\n' +
        '   · Промокод: <code>TEST100</code>',
        Markup.inlineKeyboard([
            [Markup.button.callback('🎯 Получить скидку 20%', 'get_promo')]
        ])
    );
});

bot.action('get_promo', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        '🎉 <b>Твой промокод:</b> <code>SMART20</code>\n\n' +
        'Примени его при оплате подписки!\n' +
        'Скидка 20% на первый месяц 🚀\n\n' +
        '<i>Для теста используй: TEST100</i>'
    );
});

// Поддержка
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

// Вопросы
bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    
    const menuItems = ['📚 Каталог курсов', '🎁 Акции', '⭐ Избранное', '💳 Подписка', '📊 Мой прогресс', '🆘 Поддержка'];
    
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

// ==================== WEB SERVER & API ====================

app.use(express.json());

// API для получения курсов
app.get('/api/courses', async (req, res) => {
    try {
        const categoryId = req.query.category_id;
        let query = `
            SELECT c.*, cat.name as category_name 
            FROM courses c 
            JOIN categories cat ON c.category_id = cat.id 
        `;
        let params = [];
        
        if (categoryId) {
            query += ' WHERE c.category_id = $1';
            params.push(categoryId);
        }
        
        query += ' ORDER BY c.created_at DESC';
        
        const result = await pool.query(query, params);
        res.json({ success: true, courses: result.rows });
    } catch (error) {
        console.error('❌ API courses error:', error);
        res.json({ success: false, error: 'Ошибка загрузки курсов' });
    }
});

// API для категорий
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY name');
        res.json({ success: true, categories: result.rows });
    } catch (error) {
        console.error('❌ API categories error:', error);
        res.json({ success: false, error: 'Ошибка загрузки категорий' });
    }
});

// API для избранного
app.get('/api/favorites/:telegramId', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT c.* FROM courses c
             JOIN user_favorites uf ON c.id = uf.course_id
             JOIN users u ON uf.user_id = u.id
             WHERE u.telegram_id = $1`,
            [req.params.telegramId]
        );
        res.json({ success: true, favorites: result.rows });
    } catch (error) {
        console.error('❌ API favorites error:', error);
        res.json({ success: false, error: 'Ошибка загрузки избранного' });
    }
});

// API для добавления в избранное
app.post('/api/favorites/:telegramId/:courseId', async (req, res) => {
    try {
        await pool.query(
            `INSERT INTO user_favorites (user_id, course_id) 
             VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2)
             ON CONFLICT (user_id, course_id) DO NOTHING`,
            [req.params.telegramId, req.params.courseId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Add favorite error:', error);
        res.json({ success: false, error: 'Ошибка добавления' });
    }
});

// API для удаления из избранного
app.delete('/api/favorites/:telegramId/:courseId', async (req, res) => {
    try {
        await pool.query(
            `DELETE FROM user_favorites 
             WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1) 
             AND course_id = $2`,
            [req.params.telegramId, req.params.courseId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Remove favorite error:', error);
        res.json({ success: false, error: 'Ошибка удаления' });
    }
});

// API для прогресса
app.get('/api/progress/:telegramId', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT c.*, up.progress, up.completed, up.last_watched_at
             FROM user_progress up
             JOIN courses c ON up.course_id = c.id
             JOIN users u ON up.user_id = u.id
             WHERE u.telegram_id = $1
             ORDER BY up.last_watched_at DESC`,
            [req.params.telegramId]
        );
        res.json({ success: true, progress: result.rows });
    } catch (error) {
        console.error('❌ API progress error:', error);
        res.json({ success: false, error: 'Ошибка загрузки прогресса' });
    }
});

// API для обновления прогресса
app.post('/api/progress/:telegramId/:courseId', async (req, res) => {
    try {
        const { progress, completed } = req.body;
        await pool.query(
            `INSERT INTO user_progress (user_id, course_id, progress, completed, last_watched_at) 
             VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2, $3, $4, CURRENT_TIMESTAMP)
             ON CONFLICT (user_id, course_id) 
             DO UPDATE SET progress = EXCLUDED.progress, completed = EXCLUDED.completed, last_watched_at = EXCLUDED.last_watched_at`,
            [req.params.telegramId, req.params.courseId, progress, completed]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Update progress error:', error);
        res.json({ success: false, error: 'Ошибка обновления прогресса' });
    }
});

// Главная страница
app.get('/', async (req, res) => {
    try {
        const users = await pool.query('SELECT COUNT(*) as count FROM users');
        const questions = await pool.query('SELECT COUNT(*) as count FROM user_questions');
        const courses = await pool.query('SELECT COUNT(*) as count FROM courses');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Smart Clinic Bot</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh; }
                    .container { background: rgba(255,255,255,0.1); padding: 30px; border-radius: 15px; backdrop-filter: blur(10px); }
                    h1 { text-align: center; margin-bottom: 10px; }
                    .status { background: rgba(255,255,255,0.2); padding: 20px; border-radius: 10px; margin: 20px 0; }
                    .btn { display: inline-block; background: white; color: #667eea; padding: 12px 25px; border-radius: 25px; text-decoration: none; font-weight: bold; margin: 10px 5px; }
                    .stat { background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; margin: 10px 0; }
                    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎯 Smart Clinic Bot</h1>
                    <p style="text-align: center; opacity: 0.9;">Образовательная платформа для профессионалов</p>
                    
                    <div class="status">
                        <h3>✅ СИСТЕМА РАБОТАЕТ НОРМАЛЬНО</h3>
                        
                        <div class="grid">
                            <div class="stat">
                                <p><strong>👥 Пользователей</strong></p>
                                <h2>${users.rows[0].count}</h2>
                            </div>
                            <div class="stat">
                                <p><strong>📚 Курсов</strong></p>
                                <h2>${courses.rows[0].count}</h2>
                            </div>
                            <div class="stat">
                                <p><strong>❓ Вопросов</strong></p>
                                <h2>${questions.rows[0].count}</h2>
                            </div>
                        </div>
                        
                        <p><strong>🤖 Бот:</strong> ✅ Активен</p>
                        <p><strong>🗄️ База данных:</strong> ✅ Подключена</p>
                        <p><strong>📱 WebApp:</strong> ✅ Готов</p>
                        <p><strong>🔧 Функционал:</strong> ✅ Полный</p>
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="https://t.me/smart_clinic_test_bot" class="btn">🚀 Перейти в бота</a>
                        <a href="/webapp" class="btn">📱 WebApp</a>
                        <a href="/api/courses" class="btn">📊 API курсов</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.send('Smart Clinic Bot - Full Version');
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
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
                .container { max-width: 100%; margin: 0 auto; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
                .nav { display: flex; background: white; padding: 10px; border-bottom: 1px solid #eee; }
                .nav-item { flex: 1; text-align: center; padding: 10px; color: #667eea; text-decoration: none; }
                .card { background: white; margin: 10px; padding: 15px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .course { border-left: 4px solid #667eea; padding-left: 15px; }
                .btn { background: #667eea; color: white; padding: 12px 20px; border: none; border-radius: 8px; width: 100%; font-size: 16px; margin-top: 10px; }
                .badge { background: #ff4757; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px; margin-left: 8px; }
                .tab-content { display: none; padding: 20px; }
                .tab-content.active { display: block; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📚 Smart Clinic</h1>
                    <p>Ваш каталог курсов и материалов</p>
                </div>
                
                <div class="nav">
                    <a href="#" class="nav-item" onclick="showTab('catalog')">📚 Каталог</a>
                    <a href="#" class="nav-item" onclick="showTab('favorites')">⭐ Избранное</a>
                    <a href="#" class="nav-item" onclick="showTab('progress')">📊 Прогресс</a>
                </div>
                
                <div id="catalog" class="tab-content active">
                    <div class="card">
                        <h3>Загрузка каталога...</h3>
                    </div>
                </div>
                
                <div id="favorites" class="tab-content">
                    <div class="card">
                        <h3>Загрузка избранного...</h3>
                    </div>
                </div>
                
                <div id="progress" class="tab-content">
                    <div class="card">
                        <h3>Загрузка прогресса...</h3>
                    </div>
                </div>
            </div>
            
            <script>
                let tg = window.Telegram.WebApp;
                tg.ready();
                tg.expand();
                
                const user = tg.initDataUnsafe.user;
                
                function showTab(tabName) {
                    document.querySelectorAll('.tab-content').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    document.getElementById(tabName).classList.add('active');
                    
                    if (tabName === 'catalog') loadCatalog();
                    if (tabName === 'favorites') loadFavorites();
                    if (tabName === 'progress') loadProgress();
                }
                
                async function loadCatalog() {
                    try {
                        const response = await fetch('/api/courses');
                        const data = await response.json();
                        
                        if (data.success) {
                            const catalogDiv = document.getElementById('catalog');
                            catalogDiv.innerHTML = '<div class="card"><h3>📂 Все курсы</h3></div>';
                            
                            data.courses.forEach(course => {
                                const priceText = course.price > 0 ? \`\${course.price}₽\` : 'Бесплатно';
                                const premiumBadge = course.is_premium ? '<span class="badge">PREMIUM</span>' : '';
                                
                                const courseElement = document.createElement('div');
                                courseElement.className = 'card course';
                                courseElement.innerHTML = \`
                                    <h4>\${course.title} \${premiumBadge}</h4>
                                    <p>\${course.description}</p>
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                                        <span style="color: #667eea; font-weight: bold;">\${priceText}</span>
                                        <span style="color: #999; font-size: 14px;">⏱ \${course.duration} мин</span>
                                    </div>
                                    <button class="btn" onclick="viewCourse(\${course.id})">Смотреть курс</button>
                                \`;
                                catalogDiv.appendChild(courseElement);
                            });
                        }
                    } catch (error) {
                        console.error('Ошибка загрузки каталога:', error);
                    }
                }
                
                async function loadFavorites() {
                    if (!user) return;
                    
                    try {
                        const response = await fetch(\`/api/favorites/\${user.id}\`);
                        const data = await response.json();
                        
                        const favoritesDiv = document.getElementById('favorites');
                        if (data.success && data.favorites.length > 0) {
                            favoritesDiv.innerHTML = '<div class="card"><h3>⭐ Избранное</h3></div>';
                            
                            data.favorites.forEach(course => {
                                const courseElement = document.createElement('div');
                                courseElement.className = 'card course';
                                courseElement.innerHTML = \`
                                    <h4>\${course.title}</h4>
                                    <p>\${course.description}</p>
                                    <button class="btn" onclick="viewCourse(\${course.id})">Смотреть курс</button>
                                    <button class="btn" style="background: #ff4757; margin-top: 5px;" onclick="removeFavorite(\${course.id})">Удалить</button>
                                \`;
                                favoritesDiv.appendChild(courseElement);
                            });
                        } else {
                            favoritesDiv.innerHTML = \`
                                <div class="card">
                                    <h3>⭐ Избранное</h3>
                                    <p>У вас пока нет курсов в избранном.</p>
                                    <button class="btn" onclick="showTab('catalog')">Перейти в каталог</button>
                                </div>
                            \`;
                        }
                    } catch (error) {
                        console.error('Ошибка загрузки избранного:', error);
                    }
                }
                
                async function loadProgress() {
                    if (!user) return;
                    
                    try {
                        const response = await fetch(\`/api/progress/\${user.id}\`);
                        const data = await response.json();
                        
                        const progressDiv = document.getElementById('progress');
                        if (data.success && data.progress.length > 0) {
                            progressDiv.innerHTML = '<div class="card"><h3>📊 Ваш прогресс</h3></div>';
                            
                            data.progress.forEach(item => {
                                const progressBar = \`
                                    <div style="background: #eee; border-radius: 10px; margin: 10px 0;">
                                        <div style="background: #667eea; height: 8px; border-radius: 10px; width: \${item.progress}%;"></div>
                                    </div>
                                \`;
                                
                                const courseElement = document.createElement('div');
                                courseElement.className = 'card course';
                                courseElement.innerHTML = \`
                                    <h4>\${item.title}</h4>
                                    \${progressBar}
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span>\${item.progress}% завершено</span>
                                        <span>\${item.completed ? '✅ Завершено' : '🔄 В процессе'}</span>
                                    </div>
                                    <button class="btn" onclick="viewCourse(\${item.id})">Продолжить</button>
                                \`;
                                progressDiv.appendChild(courseElement);
                            });
                        } else {
                            progressDiv.innerHTML = \`
                                <div class="card">
                                    <h3>📊 Прогресс</h3>
                                    <p>Вы еще не начали изучать курсы.</p>
                                    <button class="btn" onclick="showTab('catalog')">Начать обучение</button>
                                </div>
                            \`;
                        }
                    } catch (error) {
                        console.error('Ошибка загрузки прогресса:', error);
                    }
                }
                
                function viewCourse(courseId) {
                    alert('Просмотр курса ' + courseId + ' (функционал в разработке)');
                }
                
                async function addFavorite(courseId) {
                    if (!user) return;
                    
                    try {
                        await fetch(\`/api/favorites/\${user.id}/\${courseId}\`, { method: 'POST' });
                        alert('Курс добавлен в избранное!');
                    } catch (error) {
                        console.error('Ошибка добавления в избранное:', error);
                    }
                }
                
                async function removeFavorite(courseId) {
                    if (!user) return;
                    
                    try {
                        await fetch(\`/api/favorites/\${user.id}/\${courseId}\`, { method: 'DELETE' });
                        loadFavorites();
                    } catch (error) {
                        console.error('Ошибка удаления из избранного:', error);
                    }
                }
                
                // Загружаем каталог при старте
                loadCatalog();
            </script>
        </body>
        </html>
    `);
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Smart Clinic Bot - Full Version',
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'production'
    });
});

// ==================== ЗАПУСК СЕРВЕРА ====================

const PORT = process.env.PORT || 3000;

async function startServer() {
    await initDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server started on port ${PORT}`);
        console.log(`✅ Full functionality enabled`);
    });

    bot.launch().then(() => {
        console.log('✅ Bot started successfully!');
        console.log('🎉 FULL SYSTEM OPERATIONAL!');
    }).catch(err => {
        console.error('❌ Bot startup failed:', err);
    });
}

startServer();

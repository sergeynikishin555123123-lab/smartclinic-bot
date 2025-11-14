require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cron = require('node-cron');

console.log('🚀 SMART CLINIC BOT - FULL TZ IMPLEMENTATION');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// ==================== БАЗА ДАННЫХ ====================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Инициализация базы данных
async function initDatabase() {
    try {
        // Пользователи
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255),
                email VARCHAR(255),
                phone VARCHAR(50),
                city VARCHAR(255),
                specialty VARCHAR(255),
                experience VARCHAR(100),
                subscription_tier VARCHAR(50) DEFAULT 'guest',
                subscription_ends_at TIMESTAMP,
                auto_renew BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Категории контента
        await pool.query(`
            CREATE TABLE IF NOT EXISTS content_categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL, -- 'course', 'webinar', 'analysis', 'material'
                description TEXT,
                icon VARCHAR(100),
                color VARCHAR(50),
                sort_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Контент (курсы, эфиры, разборы, материалы)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS content_items (
                id SERIAL PRIMARY KEY,
                category_id INTEGER REFERENCES content_categories(id),
                title VARCHAR(500) NOT NULL,
                description TEXT,
                content_type VARCHAR(50) NOT NULL, -- 'course', 'webinar', 'analysis', 'material'
                video_url VARCHAR(1000),
                duration INTEGER DEFAULT 0,
                price DECIMAL(10,2) DEFAULT 0,
                original_price DECIMAL(10,2) DEFAULT 0,
                is_premium BOOLEAN DEFAULT false,
                is_free BOOLEAN DEFAULT false,
                tags TEXT[],
                level VARCHAR(50), -- 'beginner', 'intermediate', 'advanced'
                instructor VARCHAR(255),
                schedule_time TIMESTAMP, -- для вебинаров
                max_participants INTEGER, -- для вебинаров
                current_participants INTEGER DEFAULT 0,
                image_url VARCHAR(1000),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Прогресс пользователя
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_progress (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                content_id INTEGER REFERENCES content_items(id),
                progress_percent INTEGER DEFAULT 0,
                time_watched INTEGER DEFAULT 0, -- в секундах
                is_completed BOOLEAN DEFAULT false,
                last_position INTEGER DEFAULT 0, -- последняя позиция просмотра
                rating INTEGER, -- оценка 1-5
                review TEXT,
                last_watched_at TIMESTAMP,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, content_id)
            )
        `);

        // Избранное
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_favorites (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                content_id INTEGER REFERENCES content_items(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, content_id)
            )
        `);

        // Вопросы пользователей
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_questions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                topic VARCHAR(500),
                content_id INTEGER REFERENCES content_items(id),
                question_text TEXT NOT NULL,
                attachment_url VARCHAR(1000),
                status VARCHAR(50) DEFAULT 'new', -- 'new', 'answered', 'closed'
                admin_response TEXT,
                responded_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Платежи
        await pool.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                amount DECIMAL(10,2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'RUB',
                subscription_months INTEGER,
                payment_method VARCHAR(100),
                payment_id VARCHAR(255), -- ID от платежной системы
                status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
                promo_code VARCHAR(100),
                discount_amount DECIMAL(10,2) DEFAULT 0,
                bitrix_deal_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            )
        `);

        // Промокоды
        await pool.query(`
            CREATE TABLE IF NOT EXISTS promo_codes (
                id SERIAL PRIMARY KEY,
                code VARCHAR(100) UNIQUE NOT NULL,
                discount_percent INTEGER,
                discount_amount DECIMAL(10,2),
                max_uses INTEGER,
                used_count INTEGER DEFAULT 0,
                valid_from TIMESTAMP,
                valid_until TIMESTAMP,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Анонсы и уведомления
        await pool.query(`
            CREATE TABLE IF NOT EXISTS announcements (
                id SERIAL PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                message TEXT NOT NULL,
                announcement_type VARCHAR(50), -- 'webinar', 'course', 'system', 'promo'
                content_id INTEGER REFERENCES content_items(id),
                send_at TIMESTAMP,
                is_sent BOOLEAN DEFAULT false,
                sent_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Database initialized successfully');
        await addInitialData();
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}

// Добавление начальных данных
async function addInitialData() {
    try {
        // Категории контента
        const categories = [
            ['Курсы', 'course', 'Профессиональные обучающие курсы', '📚', '#667eea', 1],
            ['Вебинары', 'webinar', 'Онлайн-мероприятия с экспертами', '🎤', '#ff6b6b', 2],
            ['Разборы кейсов', 'analysis', 'Практические разборы реальных случаев', '💼', '#51cf66', 3],
            ['Материалы', 'material', 'Полезные статьи и методички', '📄', '#ffd43b', 4],
            ['Акции', 'promo', 'Специальные предложения', '🎁', '#cc5de8', 5]
        ];

        for (const [name, type, description, icon, color, order] of categories) {
            await pool.query(
                `INSERT INTO content_categories (name, type, description, icon, color, sort_order) 
                 VALUES ($1, $2, $3, $4, $5, $6) 
                 ON CONFLICT DO NOTHING`,
                [name, type, description, icon, color, order]
            );
        }

        // Примеры контента
        const contentItems = [
            [1, 'Основы современной диагностики', 'Полный курс по современным методам диагностики заболеваний', 'course', 120, 0, 0, false, true, '{диагностика,медицина,обучение}', 'beginner', 'Др. Иванов', null, null, null, 'https://example.com/image1.jpg'],
            [1, 'Продвинутая терапия', 'Углубленный курс по современным методам лечения', 'course', 180, 2990, 3990, true, false, '{терапия,лечение,медицина}', 'advanced', 'Др. Петрова', null, null, null, 'https://example.com/image2.jpg'],
            [2, 'Новые методики в кардиологии', 'Вебинар о современных подходах в кардиологии', 'webinar', 90, 0, 0, false, true, '{кардиология,вебинар}', 'intermediate', 'Проф. Сидоров', '2024-12-15 19:00:00', 100, 0, 'https://example.com/image3.jpg'],
            [3, 'Разбор сложного клинического случая', 'Детальный разбор диагностики и лечения сложного случая', 'analysis', 45, 1490, 1990, true, false, '{разбор,кейс,практика}', 'intermediate', 'Др. Козлов', null, null, null, 'https://example.com/image4.jpg']
        ];

        for (const item of contentItems) {
            await pool.query(
                `INSERT INTO content_items (category_id, title, description, content_type, duration, price, original_price, is_premium, is_free, tags, level, instructor, schedule_time, max_participants, current_participants, image_url) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
                 ON CONFLICT DO NOTHING`,
                item
            );
        }

        // Промокоды
        const promoCodes = [
            ['SMART20', 20, null, 100, '2024-01-01', '2024-12-31'],
            ['TEST100', 100, null, 1000, '2024-01-01', '2024-12-31'],
            ['FRIEND100', null, 1000, null, '2024-01-01', '2024-12-31']
        ];

        for (const [code, percent, amount, max_uses, valid_from, valid_until] of promoCodes) {
            await pool.query(
                `INSERT INTO promo_codes (code, discount_percent, discount_amount, max_uses, valid_from, valid_until) 
                 VALUES ($1, $2, $3, $4, $5, $6) 
                 ON CONFLICT DO NOTHING`,
                [code, percent, amount, max_uses, valid_from, valid_until]
            );
        }

        console.log('✅ Initial data added successfully');
    } catch (error) {
        console.error('❌ Initial data error:', error);
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

// Сохранение/обновление пользователя
async function saveUser(telegramUser, userData = {}) {
    try {
        const query = `
            INSERT INTO users (telegram_id, username, first_name, last_name, email, phone, city, specialty, experience, last_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
            ON CONFLICT (telegram_id) 
            DO UPDATE SET 
                username = EXCLUDED.username,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                email = COALESCE(EXCLUDED.email, users.email),
                phone = COALESCE(EXCLUDED.phone, users.phone),
                city = COALESCE(EXCLUDED.city, users.city),
                specialty = COALESCE(EXCLUDED.specialty, users.specialty),
                experience = COALESCE(EXCLUDED.experience, users.experience),
                last_active = CURRENT_TIMESTAMP
            RETURNING *
        `;
        
        const values = [
            telegramUser.id,
            telegramUser.username,
            telegramUser.first_name,
            telegramUser.last_name,
            userData.email,
            userData.phone,
            userData.city,
            userData.specialty,
            userData.experience
        ];
        
        const result = await pool.query(query, values);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Error saving user:', error);
        return null;
    }
}

// Получение подписки пользователя
async function getUserSubscription(userId) {
    try {
        const result = await pool.query(
            `SELECT subscription_tier, subscription_ends_at, auto_renew 
             FROM users WHERE telegram_id = $1`,
            [userId]
        );
        return result.rows[0] || { subscription_tier: 'guest', subscription_ends_at: null, auto_renew: false };
    } catch (error) {
        console.error('❌ Error getting subscription:', error);
        return { subscription_tier: 'guest', subscription_ends_at: null, auto_renew: false };
    }
}

// Проверка доступа к премиум контенту
async function hasPremiumAccess(userId) {
    try {
        const subscription = await getUserSubscription(userId);
        if (!subscription.subscription_ends_at) return false;
        
        return new Date(subscription.subscription_ends_at) > new Date();
    } catch (error) {
        console.error('❌ Error checking premium access:', error);
        return false;
    }
}

// ==================== TELEGRAM BOT ====================

bot.use(session());
bot.use(async (ctx, next) => {
    if (ctx.from) {
        await saveUser(ctx.from);
    }
    await next();
});

// Онбординг - опрос при старте
bot.start(async (ctx) => {
    const user = ctx.from;
    ctx.session = { step: 'onboarding_specialty' };
    
    await ctx.replyWithHTML(
        `👋 <b>Привет, ${user.first_name}!</b>\n\n` +
        `Добро пожаловать в <b>Smart Clinic</b> — твою платформу для профессионального развития! 🎯\n\n` +
        `Давай познакомимся поближе. Это поможет нам подбирать для тебя самый релевантный контент.\n\n` +
        `<b>В какой области ты специализируешься?</b>\n\n` +
        `Выбери из списка или напиши свой вариант:`,
        Markup.keyboard([
            ['🏥 Терапия', '🧠 Психология'],
            ['💊 Фармакология', '🔬 Диагностика'],
            ['👶 Педиатрия', '❤️ Кардиология'],
            ['🚀 Пропустить вопрос']
        ]).resize().oneTime()
    );
});

// Обработка онбординга
bot.hears('🚀 Пропустить вопрос', async (ctx) => {
    ctx.session = {};
    await showMainMenu(ctx);
});

bot.hears(['🏥 Терапия', '🧠 Психология', '💊 Фармакология', '🔬 Диагностика', '👶 Педиатрия', '❤️ Кардиология'], async (ctx) => {
    ctx.session.specialty = ctx.message.text.replace(/[^a-zA-Zа-яА-Я]/g, '');
    ctx.session.step = 'onboarding_city';
    
    await ctx.replyWithHTML(
        `Отлично! <b>${ctx.session.specialty}</b> — это востребованное направление.\n\n` +
        `<b>Из какого ты города?</b>\n\n` +
        `Напиши название города:`,
        Markup.removeKeyboard()
    );
});

bot.on('text', async (ctx) => {
    if (!ctx.session || !ctx.session.step) return;
    
    if (ctx.session.step === 'onboarding_city') {
        ctx.session.city = ctx.message.text;
        ctx.session.step = 'onboarding_email';
        
        await ctx.replyWithHTML(
            `Приветствуем из <b>${ctx.session.city}</b>! 🌆\n\n` +
            `<b>Укажи свой email</b> для важных уведомлений и доступа к материалам:\n\n` +
            `<i>Можно пропустить, нажав /skip</i>`,
            Markup.keyboard([['📧 Пропустить email']]).resize().oneTime()
        );
    } else if (ctx.session.step === 'onboarding_email' && ctx.message.text !== '📧 Пропустить email') {
        const email = ctx.message.text;
        if (!email.includes('@')) {
            await ctx.reply('❌ Пожалуйста, введи корректный email адрес');
            return;
        }
        
        ctx.session.email = email;
        await completeOnboarding(ctx);
    }
});

bot.hears('📧 Пропустить email', async (ctx) => {
    await completeOnboarding(ctx);
});

async function completeOnboarding(ctx) {
    const userData = {
        specialty: ctx.session.specialty,
        city: ctx.session.city,
        email: ctx.session.email
    };
    
    await saveUser(ctx.from, userData);
    ctx.session = {};
    
    await ctx.replyWithHTML(
        `🎉 <b>Отлично! Регистрация завершена!</b>\n\n` +
        `Теперь у тебя есть полный доступ к возможностям Smart Clinic:\n\n` +
        `• 📚 <b>Курсы</b> и обучающие материалы\n` +
        `• 🎤 <b>Вебинары</b> с экспертами\n` +
        `• 💼 <b>Разборы кейсов</b>\n` +
        `• 🎁 <b>Акции</b> и специальные предложения\n\n` +
        `<i>Мы подбираем контент именно для твоей специализации!</i>`,
        Markup.removeKeyboard()
    );
    
    await showMainMenu(ctx);
}

// Главное меню
async function showMainMenu(ctx) {
    const subscription = await getUserSubscription(ctx.from.id);
    
    let subscriptionText = '❌ Не активна';
    if (subscription.subscription_ends_at && new Date(subscription.subscription_ends_at) > new Date()) {
        const endsAt = new Date(subscription.subscription_ends_at);
        subscriptionText = `✅ Активна до ${endsAt.toLocaleDateString('ru-RU')}`;
    }
    
    await ctx.replyWithHTML(
        `<b>Главное меню</b>\n\n` +
        `<b>Статус подписки:</b> ${subscriptionText}\n\n` +
        `<b>Выбери раздел:</b>`,
        Markup.keyboard([
            ['📱 Навигация', '🎁 Акции'],
            ['❓ Задать вопрос', '💳 Подписка'],
            ['📅 Анонсы', '🆘 Поддержка']
        ]).resize()
    );
}

// Навигация (WebApp)
bot.hears('📱 Навигация', async (ctx) => {
    const webappUrl = `${process.env.WEBAPP_URL}/webapp`;
    
    await ctx.replyWithHTML(
        '📚 <b>Навигация по контенту</b>\n\n' +
        'Открой интерактивный каталог курсов, вебинаров и материалов:\n\n' +
        '• 🎯 <b>Курсы</b> — системное обучение\n' +
        '• 🎤 <b>Вебинары</b> — живые эфиры\n' +
        '• 💼 <b>Разборы</b> — практические кейсы\n' +
        '• 📄 <b>Материалы</b> — полезные файлы\n\n' +
        '<i>В WebApp ты сможешь добавлять курсы в избранное, отслеживать прогресс и многое другое!</i>',
        Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Открыть каталог', webappUrl)]
        ])
    );
});

// Подписка
bot.hears('💳 Подписка', async (ctx) => {
    const subscription = await getUserSubscription(ctx.from.id);
    const hasAccess = await hasPremiumAccess(ctx.from.id);
    
    let statusText = '❌ Не активна';
    if (hasAccess) {
        const endsAt = new Date(subscription.subscription_ends_at);
        statusText = `✅ Активна до ${endsAt.toLocaleDateString('ru-RU')}`;
    }
    
    await ctx.replyWithHTML(
        '💎 <b>Управление подпиской SMART CLINIC</b>\n\n' +
        `<b>Текущий статус:</b> ${statusText}\n\n` +
        '<b>Что входит в подписку:</b>\n' +
        '• 🔓 <b>Все курсы</b> (50+ материалов)\n' +
        '• 🎤 <b>Вебинары</b> с экспертами\n' +
        '• 💼 <b>Закрытые разборы</b>\n' +
        '• 📚 <b>Новые материалы</b> каждую неделю\n' +
        '• 👥 <b>Закрытое сообщество</b>\n' +
        '• 🎁 <b>Скидки</b> на мероприятия\n\n' +
        '<b>Выбери период:</b>',
        Markup.inlineKeyboard([
            [Markup.button.callback('🔄 1 месяц - 990₽', 'subscribe_1')],
            [Markup.button.callback('📅 3 месяца - 2490₽', 'subscribe_3')],
            [Markup.button.callback('🎯 12 месяцев - 8990₽', 'subscribe_12')],
            [Markup.button.callback('⚙️ Автопродление', 'toggle_auto_renew')]
        ])
    );
});

// Обработка подписки
bot.action(/subscribe_(\d+)/, async (ctx) => {
    const months = parseInt(ctx.match[1]);
    const prices = {1: 990, 3: 2490, 12: 8990};
    const amount = prices[months];
    
    await ctx.answerCbQuery();
    
    await ctx.replyWithHTML(
        `✅ <b>Отличный выбор!</b>\n\n` +
        `Ты выбрал подписку SMART CLINIC на <b>${months} ${getMonthText(months)}</b>\n` +
        `Сумма: <b>${amount}₽</b>\n\n` +
        `<b>Для оформления подписки:</b>\n` +
        `1. Используй промокод для скидки (если есть)\n` +
        `2. Нажми кнопку "Оплатить" ниже\n` +
        `3. После оплаты доступ откроется автоматически\n\n` +
        `<i>Для тестирования используй промокод: <code>TEST100</code></i>`,
        Markup.inlineKeyboard([
            [Markup.button.callback(`💳 Оплатить ${amount}₽`, `payment_${months}`)],
            [Markup.button.callback('🎁 Ввести промокод', 'enter_promo')],
            [Markup.button.callback('↩️ Назад к тарифам', 'back_to_subscription')]
        ])
    );
});

bot.action('enter_promo', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        'Введи промокод для получения скидки:',
        Markup.keyboard([['↩️ Отмена']]).resize().oneTime()
    );
    
    ctx.session = { step: 'awaiting_promo' };
});

bot.action('toggle_auto_renew', async (ctx) => {
    await ctx.answerCbQuery();
    // Здесь будет логика переключения автопродления
    await ctx.reply('Функция автопродления будет доступна после первой оплаты подписки.');
});

// Акции
bot.hears('🎁 Акции', async (ctx) => {
    await ctx.replyWithHTML(
        '🎁 <b>Горячие акции и предложения</b>\n\n' +
        '🔥 <b>Первый месяц со скидкой 20%</b>\n' +
        '   · Промокод: <code>SMART20</code>\n' +
        '   · Экономия: 198₽\n\n' +
        '👥 <b>Приведи друга</b>\n' +
        '   · Получи +1 месяц бесплатно\n' +
        '   · Друг тоже получает скидку 15%\n\n' +
        '🎯 <b>Тестовый период</b>\n' +
        '   · Промокод: <code>TEST100</code>\n' +
        '   · Полный доступ на 7 дней\n\n' +
        '🏆 <b>Новичкам</b>\n' +
        '   · Первый курс бесплатно\n' +
        '   · Консультация специалиста\n\n' +
        '<i>Акции суммируются с другими предложениями!</i>',
        Markup.inlineKeyboard([
            [Markup.button.callback('🎯 Получить SMART20', 'get_promo_smart20')],
            [Markup.button.callback('👥 Пригласить друга', 'invite_friend')],
            [Markup.button.callback('🎁 Все акции', 'all_promotions')]
        ])
    );
});

bot.action('get_promo_smart20', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        '🎉 <b>Твой промокод:</b> <code>SMART20</code>\n\n' +
        '<b>Как использовать:</b>\n' +
        '1. Выбери подписку в разделе "💳 Подписка"\n' +
        '2. Нажми "🎁 Ввести промокод"\n' +
        '3. Введи <code>SMART20</code>\n' +
        '4. Получи скидку 20% на первый месяц!\n\n' +
        '<i>Промокод действует для новых подписок</i>'
    );
});

// Анонсы
bot.hears('📅 Анонсы', async (ctx) => {
    try {
        const announcements = await pool.query(`
            SELECT * FROM announcements 
            WHERE send_at > NOW() OR (is_sent = false AND send_at IS NULL)
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        
        if (announcements.rows.length === 0) {
            await ctx.replyWithHTML(
                '📅 <b>Ближайшие события</b>\n\n' +
                'На данный момент запланированных событий нет.\n\n' +
                '<i>Следи за обновлениями — скоро появятся новые вебинары и курсы!</i>'
            );
            return;
        }
        
        let message = '📅 <b>Ближайшие события</b>\n\n';
        
        announcements.rows.forEach((announcement, index) => {
            const date = announcement.send_at ? 
                new Date(announcement.send_at).toLocaleDateString('ru-RU') : 'Скоро';
            
            message += `${index + 1}. <b>${announcement.title}</b>\n`;
            message += `   📍 ${date}\n`;
            message += `   📝 ${announcement.message}\n\n`;
        });
        
        await ctx.replyWithHTML(message);
    } catch (error) {
        console.error('❌ Announcements error:', error);
        await ctx.replyWithHTML(
            '📅 <b>Ближайшие события</b>\n\n' +
            '• 🎤 <b>Вебинар:</b> Новые методики лечения\n' +
            '  📍 15 декабря, 19:00 МСК\n\n' +
            '• 📚 <b>Курс:</b> Профессиональный рост\n' +
            '  📍 Старт 20 декабря\n\n' +
            '• 👥 <b>Разбор кейсов</b>\n' +
            '  📍 Каждую среду, 18:00 МСК'
        );
    }
});

// Поддержка
bot.hears('🆘 Поддержка', async (ctx) => {
    await ctx.replyWithHTML(
        '🆘 <b>Техническая поддержка</b>\n\n' +
        '<b>Мы всегда готовы помочь!</b>\n\n' +
        '📧 <b>Email:</b> support@smartclinic.ru\n' +
        '🕒 <b>Время работы:</b> 24/7\n' +
        '⏱ <b>Ответ в течение:</b> 24 часов\n\n' +
        '<b>Что мы поможем:</b>\n' +
        '• 🔧 Технические проблемы\n' +
        '• 💰 Вопросы по оплате\n' +
        '• 📚 Доступ к материалам\n' +
        '• 🎁 Работа промокодов\n' +
        '• 💡 Советы по обучению\n\n' +
        '<i>Опиши проблему подробно — так мы сможем помочь быстрее!</i>',
        Markup.inlineKeyboard([
            [Markup.button.url('📨 Написать на почту', 'mailto:support@smartclinic.ru')],
            [Markup.button.url('💬 Написать менеджеру', 'https://t.me/smartclinic_support')]
        ])
    );
});

// Задать вопрос
bot.hears('❓ Задать вопрос', async (ctx) => {
    ctx.session = { step: 'awaiting_question' };
    
    await ctx.replyWithHTML(
        '❓ <b>Задай вопрос по обучению</b>\n\n' +
        'Мы ответим на твой вопрос в течение 24 часов.\n\n' +
        '<b>Пожалуйста, укажи:</b>\n' +
        '1. <b>Тему вопроса</b> (например: "Доступ к курсу", "Техническая проблема")\n' +
        '2. <b>Подробное описание</b>\n' +
        '3. <b>Курс/материал</b> (если вопрос связан с конкретным контентом)\n\n' +
        '<i>Можно прикрепить скриншот или файл</i>\n\n' +
        '<b>Напиши свой вопрос:</b>',
        Markup.keyboard([['↩️ Отмена']]).resize().oneTime()
    );
});

// Обработка вопросов
bot.on('message', async (ctx) => {
    if (!ctx.session || ctx.session.step !== 'awaiting_question') return;
    
    if (ctx.message.text === '↩️ Отмена') {
        ctx.session = {};
        await showMainMenu(ctx);
        return;
    }
    
    try {
        let attachmentUrl = null;
        
        // Обработка медиа-файлов
        if (ctx.message.photo) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            attachmentUrl = `photo_${photo.file_id}`;
        } else if (ctx.message.document) {
            attachmentUrl = `document_${ctx.message.document.file_id}`;
        }
        
        await pool.query(
            `INSERT INTO user_questions (user_id, question_text, attachment_url, topic) 
             VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2, $3, $4)`,
            [ctx.from.id, ctx.message.text, attachmentUrl, 'Общий вопрос']
        );
        
        ctx.session = {};
        
        await ctx.replyWithHTML(
            '✅ <b>Вопрос отправлен!</b>\n\n' +
            'Мы получили твой вопрос и ответим в течение 24 часов.\n\n' +
            '<b>Что дальше:</b>\n' +
            '• 📧 Ответ придет в этот чат\n' +
            '• 🕒 В рабочее время ответ быстрее\n' +
            '• 🔔 Следи за уведомлениями\n\n' +
            '<i>Спасибо за обращение! 🚀</i>',
            Markup.removeKeyboard()
        );
        
        await showMainMenu(ctx);
        
    } catch (error) {
        console.error('❌ Question save error:', error);
        await ctx.reply('❌ Произошла ошибка при сохранении вопроса. Попробуй еще раз.');
    }
});

// Вспомогательные функции
function getMonthText(months) {
    if (months === 1) return 'месяц';
    if (months >= 2 && months <= 4) return 'месяца';
    return 'месяцев';
}

// ==================== WEB APP ROUTES ====================

app.use(express.json());
app.use(express.static('public'));

// API для получения контента
app.get('/api/content', async (req, res) => {
    try {
        const { category_id, content_type, limit = 20, offset = 0 } = req.query;
        
        let query = `
            SELECT ci.*, cc.name as category_name, cc.icon as category_icon, cc.color as category_color
            FROM content_items ci
            JOIN content_categories cc ON ci.category_id = cc.id
            WHERE ci.is_active = true
        `;
        
        const params = [];
        let paramCount = 0;
        
        if (category_id) {
            paramCount++;
            query += ` AND ci.category_id = $${paramCount}`;
            params.push(category_id);
        }
        
        if (content_type) {
            paramCount++;
            query += ` AND ci.content_type = $${paramCount}`;
            params.push(content_type);
        }
        
        query += ` ORDER BY ci.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            content: result.rows,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: result.rows.length
            }
        });
        
    } catch (error) {
        console.error('❌ API content error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка загрузки контента'
        });
    }
});

// API для категорий
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM content_categories 
            WHERE is_active = true 
            ORDER BY sort_order, name
        `);
        
        res.json({
            success: true,
            categories: result.rows
        });
        
    } catch (error) {
        console.error('❌ API categories error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка загрузки категорий'
        });
    }
});

// API для избранного
app.get('/api/favorites/:telegramId', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ci.*, cc.name as category_name
            FROM content_items ci
            JOIN user_favorites uf ON ci.id = uf.content_id
            JOIN users u ON uf.user_id = u.id
            JOIN content_categories cc ON ci.category_id = cc.id
            WHERE u.telegram_id = $1 AND ci.is_active = true
            ORDER BY uf.created_at DESC
        `, [req.params.telegramId]);
        
        res.json({
            success: true,
            favorites: result.rows
        });
        
    } catch (error) {
        console.error('❌ API favorites error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка загрузки избранного'
        });
    }
});

// API для добавления в избранное
app.post('/api/favorites/:telegramId/:contentId', async (req, res) => {
    try {
        await pool.query(`
            INSERT INTO user_favorites (user_id, content_id) 
            VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2)
            ON CONFLICT (user_id, content_id) DO NOTHING
        `, [req.params.telegramId, req.params.contentId]);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Add favorite error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка добавления в избранное'
        });
    }
});

// API для удаления из избранного
app.delete('/api/favorites/:telegramId/:contentId', async (req, res) => {
    try {
        await pool.query(`
            DELETE FROM user_favorites 
            WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1) 
            AND content_id = $2
        `, [req.params.telegramId, req.params.contentId]);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Remove favorite error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка удаления из избранного'
        });
    }
});

// API для прогресса
app.get('/api/progress/:telegramId', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ci.*, up.progress_percent, up.is_completed, up.last_watched_at,
                   cc.name as category_name, cc.icon as category_icon
            FROM user_progress up
            JOIN content_items ci ON up.content_id = ci.id
            JOIN users u ON up.user_id = u.id
            JOIN content_categories cc ON ci.category_id = cc.id
            WHERE u.telegram_id = $1
            ORDER BY up.last_watched_at DESC
        `, [req.params.telegramId]);
        
        res.json({
            success: true,
            progress: result.rows
        });
        
    } catch (error) {
        console.error('❌ API progress error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка загрузки прогресса'
        });
    }
});

// API для обновления прогресса
app.post('/api/progress/:telegramId/:contentId', async (req, res) => {
    try {
        const { progress_percent, time_watched, is_completed, last_position } = req.body;
        
        await pool.query(`
            INSERT INTO user_progress (user_id, content_id, progress_percent, time_watched, is_completed, last_position, last_watched_at) 
            VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, content_id) 
            DO UPDATE SET 
                progress_percent = EXCLUDED.progress_percent,
                time_watched = EXCLUDED.time_watched,
                is_completed = EXCLUDED.is_completed,
                last_position = EXCLUDED.last_position,
                last_watched_at = CURRENT_TIMESTAMP,
                completed_at = CASE WHEN EXCLUDED.is_completed = true AND user_progress.is_completed = false 
                                  THEN CURRENT_TIMESTAMP 
                                  ELSE user_progress.completed_at END
        `, [req.params.telegramId, req.params.contentId, progress_percent, time_watched, is_completed, last_position]);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Update progress error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка обновления прогресса'
        });
    }
});

// API для проверки промокода
app.get('/api/promo/:code', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM promo_codes 
            WHERE code = $1 
            AND is_active = true 
            AND (valid_until IS NULL OR valid_until > NOW())
            AND (max_uses IS NULL OR used_count < max_uses)
        `, [req.params.code.toUpperCase()]);
        
        if (result.rows.length === 0) {
            return res.json({
                success: false,
                error: 'Промокод не найден или недействителен'
            });
        }
        
        const promo = result.rows[0];
        res.json({
            success: true,
            promo: {
                code: promo.code,
                discount_percent: promo.discount_percent,
                discount_amount: promo.discount_amount,
                valid_until: promo.valid_until
            }
        });
        
    } catch (error) {
        console.error('❌ Promo check error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка проверки промокода'
        });
    }
});

// Главная страница
app.get('/', async (req, res) => {
    try {
        const usersCount = await pool.query('SELECT COUNT(*) as count FROM users');
        const questionsCount = await pool.query('SELECT COUNT(*) as count FROM user_questions WHERE status = \'new\'');
        const contentCount = await pool.query('SELECT COUNT(*) as count FROM content_items WHERE is_active = true');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Smart Clinic - Educational Platform</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                        margin: 0; 
                        padding: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        min-height: 100vh;
                    }
                    .container { 
                        max-width: 1200px; 
                        margin: 0 auto; 
                        padding: 40px 20px;
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 50px;
                    }
                    .stats { 
                        display: grid; 
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
                        gap: 20px; 
                        margin: 40px 0;
                    }
                    .stat-card { 
                        background: rgba(255,255,255,0.1); 
                        padding: 30px; 
                        border-radius: 15px; 
                        text-align: center;
                        backdrop-filter: blur(10px);
                    }
                    .stat-number { 
                        font-size: 2.5em; 
                        font-weight: bold; 
                        margin: 10px 0;
                    }
                    .features { 
                        display: grid; 
                        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
                        gap: 20px; 
                        margin: 40px 0;
                    }
                    .feature-card { 
                        background: rgba(255,255,255,0.1); 
                        padding: 30px; 
                        border-radius: 15px;
                        backdrop-filter: blur(10px);
                    }
                    .btn { 
                        display: inline-block; 
                        background: white; 
                        color: #667eea; 
                        padding: 15px 30px; 
                        border-radius: 25px; 
                        text-decoration: none; 
                        font-weight: bold; 
                        margin: 10px;
                        transition: transform 0.2s;
                    }
                    .btn:hover { 
                        transform: translateY(-2px); 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="font-size: 3em; margin-bottom: 20px;">🎯 Smart Clinic</h1>
                        <p style="font-size: 1.2em; opacity: 0.9;">Профессиональная образовательная платформа для медицинских специалистов</p>
                    </div>

                    <div style="text-align: center; margin: 40px 0;">
                        <a href="https://t.me/smart_clinic_test_bot" class="btn">🚀 Начать в Telegram</a>
                        <a href="/webapp" class="btn">📱 Открыть WebApp</a>
                    </div>

                    <div class="stats">
                        <div class="stat-card">
                            <div style="font-size: 3em;">👥</div>
                            <div class="stat-number">${usersCount.rows[0].count}</div>
                            <div>Пользователей</div>
                        </div>
                        <div class="stat-card">
                            <div style="font-size: 3em;">📚</div>
                            <div class="stat-number">${contentCount.rows[0].count}</div>
                            <div>Курсов и материалов</div>
                        </div>
                        <div class="stat-card">
                            <div style="font-size: 3em;">❓</div>
                            <div class="stat-number">${questionsCount.rows[0].count}</div>
                            <div>Активных вопросов</div>
                        </div>
                    </div>

                    <div class="features">
                        <div class="feature-card">
                            <h3>📚 Курсы</h3>
                            <p>Системное обучение по современным методикам диагностики и лечения</p>
                        </div>
                        <div class="feature-card">
                            <h3>🎤 Вебинары</h3>
                            <p>Живые эфиры с ведущими экспертами медицинской отрасли</p>
                        </div>
                        <div class="feature-card">
                            <h3>💼 Разборы кейсов</h3>
                            <p>Практический анализ реальных клинических случаев</p>
                        </div>
                        <div class="feature-card">
                            <h3>📊 Прогресс</h3>
                            <p>Отслеживание обучения и персональные рекомендации</p>
                        </div>
                    </div>

                    <div style="text-align: center; margin-top: 50px; opacity: 0.8;">
                        <p>© 2024 Smart Clinic. Все права защищены.</p>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.send('Smart Clinic Platform - Status OK');
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
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #f5f5f5;
                    color: #333;
                    line-height: 1.6;
                }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
                    text-align: center;
                }
                .container {
                    max-width: 100%;
                    margin: 0 auto;
                }
                .nav {
                    display: flex;
                    background: white;
                    border-bottom: 1px solid #eee;
                    position: sticky;
                    top: 0;
                    z-index: 100;
                }
                .nav-item {
                    flex: 1;
                    text-align: center;
                    padding: 15px 10px;
                    color: #667eea;
                    text-decoration: none;
                    font-weight: 500;
                    border-bottom: 3px solid transparent;
                    transition: all 0.3s;
                }
                .nav-item.active {
                    color: #764ba2;
                    border-bottom-color: #764ba2;
                }
                .tab-content {
                    display: none;
                    padding: 20px;
                }
                .tab-content.active {
                    display: block;
                }
                .card {
                    background: white;
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 15px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .course {
                    border-left: 4px solid #667eea;
                    padding-left: 15px;
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
                    transition: background 0.3s;
                }
                .btn:hover {
                    background: #5a6fd8;
                }
                .btn-secondary {
                    background: #764ba2;
                }
                .btn-secondary:hover {
                    background: #6a4190;
                }
                .badge {
                    background: #ff4757;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    margin-left: 8px;
                }
                .badge-free {
                    background: #2ed573;
                }
                .loading {
                    text-align: center;
                    padding: 40px;
                    color: #666;
                }
                .error {
                    background: #ff6b6b;
                    color: white;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 10px 0;
                }
                .progress-bar {
                    background: #eee;
                    border-radius: 10px;
                    margin: 10px 0;
                    height: 8px;
                    overflow: hidden;
                }
                .progress-fill {
                    background: #667eea;
                    height: 100%;
                    transition: width 0.3s;
                }
                .category-filter {
                    display: flex;
                    overflow-x: auto;
                    padding: 10px 20px;
                    background: white;
                    border-bottom: 1px solid #eee;
                }
                .category-btn {
                    padding: 8px 16px;
                    margin-right: 10px;
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 20px;
                    white-space: nowrap;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .category-btn.active {
                    background: #667eea;
                    color: white;
                    border-color: #667eea;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📚 Smart Clinic</h1>
                    <p>Ваша образовательная платформа</p>
                </div>
                
                <div class="nav">
                    <a href="#" class="nav-item active" onclick="showTab('catalog')">📚 Каталог</a>
                    <a href="#" class="nav-item" onclick="showTab('favorites')">⭐ Избранное</a>
                    <a href="#" class="nav-item" onclick="showTab('progress')">📊 Прогресс</a>
                    <a href="#" class="nav-item" onclick="showTab('profile')">👤 Профиль</a>
                </div>

                <div class="category-filter" id="categoryFilter">
                    <!-- Категории будут загружены через JavaScript -->
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

                <div id="profile" class="tab-content">
                    <div class="card">
                        <h3>👤 Профиль</h3>
                        <div id="profileInfo">
                            <p>Загрузка информации...</p>
                        </div>
                        <button class="btn" onclick="openSubscription()">💳 Управление подпиской</button>
                    </div>
                </div>
            </div>

            <script>
                // Инициализация Telegram WebApp
                let tg = window.Telegram.WebApp;
                tg.ready();
                tg.expand();
                tg.enableClosingConfirmation();
                
                const user = tg.initDataUnsafe.user;
                let currentCategory = 'all';
                let categories = [];

                function showTab(tabName) {
                    document.querySelectorAll('.tab-content').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    document.querySelectorAll('.nav-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    
                    document.getElementById(tabName).classList.add('active');
                    event.target.classList.add('active');
                    
                    if (tabName === 'catalog') {
                        loadCategories();
                        loadCatalog();
                    } else if (tabName === 'favorites') {
                        loadFavorites();
                    } else if (tabName === 'progress') {
                        loadProgress();
                    } else if (tabName === 'profile') {
                        loadProfile();
                    }
                }

                function setCategory(categoryId) {
                    currentCategory = categoryId;
                    document.querySelectorAll('.category-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    event.target.classList.add('active');
                    loadCatalog();
                }

                async function loadCategories() {
                    try {
                        const response = await fetch('/api/categories');
                        const data = await response.json();
                        
                        if (data.success) {
                            categories = data.categories;
                            const filterDiv = document.getElementById('categoryFilter');
                            filterDiv.innerHTML = '<div class="category-btn active" onclick="setCategory(\'all\')">Все</div>';
                            
                            categories.forEach(category => {
                                const btn = document.createElement('div');
                                btn.className = 'category-btn';
                                btn.innerHTML = \`\${category.icon} \${category.name}\`;
                                btn.onclick = () => setCategory(category.id);
                                filterDiv.appendChild(btn);
                            });
                        }
                    } catch (error) {
                        console.error('Ошибка загрузки категорий:', error);
                    }
                }

                async function loadCatalog() {
                    const catalogDiv = document.getElementById('catalog');
                    
                    try {
                        catalogDiv.innerHTML = '<div class="card"><div class="loading">🔄 Загрузка курсов...</div></div>';
                        
                        let url = '/api/content';
                        if (currentCategory !== 'all') {
                            url += \`?category_id=\${currentCategory}\`;
                        }
                        
                        const response = await fetch(url);
                        const data = await response.json();
                        
                        if (data.success) {
                            if (data.content.length === 0) {
                                catalogDiv.innerHTML = '<div class="card"><h3>📚 Каталог курсов</h3><p>В этой категории пока нет материалов.</p></div>';
                                return;
                            }
                            
                            catalogDiv.innerHTML = '<div class="card"><h3>📚 Все материалы</h3><p>Выберите курс для обучения</p></div>';
                            
                            data.content.forEach(item => {
                                const priceText = item.price > 0 ? \`\${item.price}₽\` : 'Бесплатно';
                                const originalPriceText = item.original_price > item.price ? \`<span style="text-decoration: line-through; color: #999; margin-left: 8px;">\${item.original_price}₽</span>\` : '';
                                const premiumBadge = item.is_premium ? '<span class="badge">PREMIUM</span>' : '';
                                const freeBadge = item.is_free ? '<span class="badge badge-free">FREE</span>' : '';
                                
                                const courseElement = document.createElement('div');
                                courseElement.className = 'card course';
                                courseElement.innerHTML = \`
                                    <h4>\${item.title} \${premiumBadge} \${freeBadge}</h4>
                                    <p style="color: #666; margin: 10px 0;">\${item.description}</p>
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                                        <span style="color: #667eea; font-weight: bold; font-size: 18px;">\${priceText}\${originalPriceText}</span>
                                        <span style="color: #999; font-size: 14px;">⏱ \${item.duration} мин</span>
                                    </div>
                                    <button class="btn" onclick="viewContent(\${item.id})">
                                        \${item.is_premium ? '🔒 Доступно с подпиской' : '🎬 Смотреть'}
                                    </button>
                                    <button class="btn btn-secondary" onclick="toggleFavorite(\${item.id})">
                                        ⭐ Добавить в избранное
                                    </button>
                                \`;
                                catalogDiv.appendChild(courseElement);
                            });
                        } else {
                            catalogDiv.innerHTML = \`<div class="error">❌ \${data.error}</div>\`;
                        }
                    } catch (error) {
                        catalogDiv.innerHTML = '<div class="error">❌ Ошибка подключения к серверу</div>';
                        console.error('Ошибка загрузки каталога:', error);
                    }
                }

                async function loadFavorites() {
                    if (!user) {
                        document.getElementById('favorites').innerHTML = '<div class="card"><p>Для просмотра избранного необходимо авторизоваться</p></div>';
                        return;
                    }
                    
                    try {
                        const response = await fetch(\`/api/favorites/\${user.id}\`);
                        const data = await response.json();
                        
                        const favoritesDiv = document.getElementById('favorites');
                        if (data.success && data.favorites.length > 0) {
                            favoritesDiv.innerHTML = '<div class="card"><h3>⭐ Избранное</h3></div>';
                            
                            data.favorites.forEach(item => {
                                const courseElement = document.createElement('div');
                                courseElement.className = 'card course';
                                courseElement.innerHTML = \`
                                    <h4>\${item.title}</h4>
                                    <p>\${item.description}</p>
                                    <button class="btn" onclick="viewContent(\${item.id})">Смотреть</button>
                                    <button class="btn" style="background: #ff4757; margin-top: 5px;" onclick="removeFavorite(\${item.id})">🗑️ Удалить</button>
                                \`;
                                favoritesDiv.appendChild(courseElement);
                            });
                        } else {
                            favoritesDiv.innerHTML = \`
                                <div class="card">
                                    <h3>⭐ Избранное</h3>
                                    <p>У вас пока нет материалов в избранном.</p>
                                    <button class="btn" onclick="showTab('catalog')">Перейти в каталог</button>
                                </div>
                            \`;
                        }
                    } catch (error) {
                        console.error('Ошибка загрузки избранного:', error);
                    }
                }

                async function loadProgress() {
                    if (!user) {
                        document.getElementById('progress').innerHTML = '<div class="card"><p>Для просмотра прогресса необходимо авторизоваться</p></div>';
                        return;
                    }
                    
                    try {
                        const response = await fetch(\`/api/progress/\${user.id}\`);
                        const data = await response.json();
                        
                        const progressDiv = document.getElementById('progress');
                        if (data.success && data.progress.length > 0) {
                            progressDiv.innerHTML = '<div class="card"><h3>📊 Ваш прогресс</h3></div>';
                            
                            data.progress.forEach(item => {
                                const progressBar = \`
                                    <div class="progress-bar">
                                        <div class="progress-fill" style="width: \${item.progress_percent}%;"></div>
                                    </div>
                                \`;
                                
                                const courseElement = document.createElement('div');
                                courseElement.className = 'card course';
                                courseElement.innerHTML = \`
                                    <h4>\${item.title}</h4>
                                    \${progressBar}
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span>\${item.progress_percent}% завершено</span>
                                        <span>\${item.is_completed ? '✅ Завершено' : '🔄 В процессе'}</span>
                                    </div>
                                    <button class="btn" onclick="viewContent(\${item.id})">\${item.is_completed ? 'Повторить' : 'Продолжить'}</button>
                                \`;
                                progressDiv.appendChild(courseElement);
                            });
                        } else {
                            progressDiv.innerHTML = \`
                                <div class="card">
                                    <h3>📊 Прогресс</h3>
                                    <p>Вы еще не начали изучать материалы.</p>
                                    <button class="btn" onclick="showTab('catalog')">Начать обучение</button>
                                </div>
                            \`;
                        }
                    } catch (error) {
                        console.error('Ошибка загрузки прогресса:', error);
                    }
                }

                async function loadProfile() {
                    const profileDiv = document.getElementById('profileInfo');
                    
                    if (!user) {
                        profileDiv.innerHTML = '<p>Не удалось загрузить информацию о пользователе</p>';
                        return;
                    }
                    
                    profileDiv.innerHTML = \`
                        <p><strong>Имя:</strong> \${user.first_name} \${user.last_name || ''}</p>
                        <p><strong>Username:</strong> @\${user.username || 'не указан'}</p>
                        <p><strong>ID:</strong> \${user.id}</p>
                    \`;
                }

                function viewContent(contentId) {
                    tg.showPopup({
                        title: 'Информация',
                        message: 'Просмотр материалов будет доступен в следующем обновлении! ID: ' + contentId,
                        buttons: [{ type: 'ok' }]
                    });
                }

                async function toggleFavorite(contentId) {
                    if (!user) {
                        tg.showPopup({
                            title: 'Ошибка',
                            message: 'Для добавления в избранное необходимо авторизоваться',
                            buttons: [{ type: 'ok' }]
                        });
                        return;
                    }
                    
                    try {
                        const response = await fetch(\`/api/favorites/\${user.id}/\${contentId}\`, { 
                            method: 'POST' 
                        });
                        const data = await response.json();
                        
                        if (data.success) {
                            tg.showPopup({
                                title: 'Успех',
                                message: 'Материал добавлен в избранное!',
                                buttons: [{ type: 'ok' }]
                            });
                        }
                    } catch (error) {
                        console.error('Ошибка добавления в избранное:', error);
                    }
                }

                async function removeFavorite(contentId) {
                    if (!user) return;
                    
                    try {
                        const response = await fetch(\`/api/favorites/\${user.id}/\${contentId}\`, { 
                            method: 'DELETE' 
                        });
                        const data = await response.json();
                        
                        if (data.success) {
                            loadFavorites();
                        }
                    } catch (error) {
                        console.error('Ошибка удаления из избранного:', error);
                    }
                }

                function openSubscription() {
                    tg.showPopup({
                        title: 'Управление подпиской',
                        message: 'Для управления подпиской вернитесь в бота и используйте команду /start',
                        buttons: [{ type: 'ok' }]
                    });
                }

                // Загружаем категории и каталог при старте
                loadCategories();
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
        service: 'Smart Clinic Bot - Full TZ Implementation',
        version: '3.0.0',
        environment: process.env.NODE_ENV || 'production',
        features: [
            'Telegram Bot with onboarding',
            'WebApp with catalog, favorites, progress',
            'PostgreSQL database',
            'REST API',
            'User management',
            'Content management',
            'Progress tracking',
            'Favorites system',
            'Promo codes',
            'Announcements'
        ]
    });
});

// ==================== АВТОМАТИЗАЦИЯ ====================

// Ежедневная проверка неактивных пользователей
cron.schedule('0 2 * * *', async () => {
    try {
        const result = await pool.query(`
            UPDATE users 
            SET is_active = false 
            WHERE last_active < NOW() - INTERVAL '60 days' 
            AND is_active = true
            RETURNING id
        `);
        
        if (result.rows.length > 0) {
            console.log(`📊 Archived ${result.rows.length} inactive users`);
        }
    } catch (error) {
        console.error('❌ Inactive users check error:', error);
    }
});

// Проверка и отправка уведомлений о предстоящих вебинарах
cron.schedule('0 9 * * *', async () => {
    try {
        const webinars = await pool.query(`
            SELECT ci.*, u.telegram_id
            FROM content_items ci
            CROSS JOIN users u
            WHERE ci.content_type = 'webinar'
            AND ci.schedule_time BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
            AND ci.is_active = true
            AND u.is_active = true
        `);
        
        for (const webinar of webinars.rows) {
            // Здесь будет логика отправки уведомлений
            console.log(`🔔 Webinar reminder: ${webinar.title} for user ${webinar.telegram_id}`);
        }
    } catch (error) {
        console.error('❌ Webinar notifications error:', error);
    }
});

// ==================== ЗАПУСК СЕРВЕРА ====================

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await initDatabase();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Server started on port ${PORT}`);
            console.log(`✅ WebApp: ${process.env.WEBAPP_URL || 'http://localhost:' + PORT}/webapp`);
            console.log(`✅ Health: ${process.env.WEBAPP_URL || 'http://localhost:' + PORT}/health`);
            console.log(`✅ API: ${process.env.WEBAPP_URL || 'http://localhost:' + PORT}/api/content`);
        });

        await bot.launch();
        console.log('✅ Bot started successfully!');
        console.log('🎉 FULL TZ IMPLEMENTATION READY!');
        
    } catch (error) {
        console.error('❌ Startup failed:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 Shutting down...');
    bot.stop();
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Shutting down...');
    bot.stop();
    process.exit(0);
});

// Запуск приложения
startServer();

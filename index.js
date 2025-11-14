require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');

console.log('🚀 Starting Smart Clinic Bot...');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Простой старт
bot.start(async (ctx) => {
    await ctx.replyWithHTML(
        `👋 <b>Привет, ${ctx.from.first_name}!</b>\n\n` +
        `Добро пожаловать в <b>Smart Clinic</b>! 🎯`,
        Markup.keyboard([
            ['📱 Навигация', '🎁 Акции'],
            ['🆘 Поддержка']
        ]).resize()
    );
});

bot.hears('📱 Навигация', async (ctx) => {
    await ctx.reply('Открываю навигацию...');
});

bot.hears('🆘 Поддержка', async (ctx) => {
    await ctx.reply('Поддержка: support@smartclinic.ru');
});

// Запуск бота
bot.launch().then(() => {
    console.log('✅ Bot started!');
});

// Веб-сервер
app.get('/', (req, res) => {
    res.send('Smart Clinic Bot - WORKING!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server on port ${PORT}`);
});

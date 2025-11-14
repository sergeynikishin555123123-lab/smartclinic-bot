const { Telegraf, Markup } = require('telegraf');
const User = require('../models/User');
const Content = require('../models/Content');

class BotController {
  constructor(bot) {
    this.bot = bot;
  }

  async handleStart(ctx) {
    const user = ctx.from;
    ctx.session = { step: 'onboarding_specialty' };
    
    await ctx.replyWithHTML(
      `👋 <b>Привет, ${user.first_name}!</b>\n\n` +
      `Добро пожаловать в <b>Smart Clinic</b> — твою платформу для профессионального развития! 🎯\n\n` +
      `Давай познакомимся поближе. Это поможет нам подбирать для тебя самый релевантный контент.\n\n` +
      `<b>В какой области ты специализируешься?</b>`,
      Markup.keyboard([
        ['🏥 Терапия', '🧠 Психология'],
        ['💊 Фармакология', '🔬 Диагностика'],
        ['👶 Педиатрия', '❤️ Кардиология'],
        ['🚀 Пропустить вопрос']
      ]).resize().oneTime()
    );
  }

  async handleOnboarding(ctx, session) {
    if (session.step === 'onboarding_specialty') {
      if (ctx.message.text !== '🚀 Пропустить вопрос') {
        session.specialty = ctx.message.text.replace(/[^a-zA-Zа-яА-Я]/g, '');
        session.step = 'onboarding_city';
        
        await ctx.replyWithHTML(
          `Отлично! <b>${session.specialty}</b> — это востребованное направление.\n\n` +
          `<b>Из какого ты города?</b>\n\n` +
          `Напиши название города:`,
          Markup.removeKeyboard()
        );
      } else {
        await this.completeOnboarding(ctx, {});
      }
    } else if (session.step === 'onboarding_city') {
      session.city = ctx.message.text;
      session.step = 'onboarding_email';
      
      await ctx.replyWithHTML(
        `Приветствуем из <b>${session.city}</b>! 🌆\n\n` +
        `<b>Укажи свой email</b> для важных уведомлений и доступа к материалам:\n\n` +
        `<i>Можно пропустить, нажав /skip</i>`,
        Markup.keyboard([['📧 Пропустить email']]).resize().oneTime()
      );
    } else if (session.step === 'onboarding_email') {
      if (ctx.message.text !== '📧 Пропустить email') {
        const email = ctx.message.text;
        if (!email.includes('@')) {
          await ctx.reply('❌ Пожалуйста, введи корректный email адрес');
          return;
        }
        session.email = email;
      }
      await this.completeOnboarding(ctx, session);
    }
  }

  async completeOnboarding(ctx, session) {
    const userData = {
      specialty: session.specialty,
      city: session.city,
      email: session.email
    };
    
    await User.createOrUpdate(ctx.from, userData);
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
    
    await this.showMainMenu(ctx);
  }

  async showMainMenu(ctx) {
    const user = await User.findByTelegramId(ctx.from.id);
    
    let subscriptionText = '❌ Не активна';
    if (user?.subscription_ends_at && new Date(user.subscription_ends_at) > new Date()) {
      const endsAt = new Date(user.subscription_ends_at);
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

  async handleNavigation(ctx) {
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
  }

  async handleSubscription(ctx) {
    const user = await User.findByTelegramId(ctx.from.id);
    const hasAccess = user?.subscription_ends_at && new Date(user.subscription_ends_at) > new Date();
    
    let statusText = '❌ Не активна';
    if (hasAccess) {
      const endsAt = new Date(user.subscription_ends_at);
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
  }

  async handleAnnouncements(ctx) {
    try {
      const webinars = await Content.getUpcomingWebinars();
      
      if (webinars.length === 0) {
        await ctx.replyWithHTML(
          '📅 <b>Ближайшие события</b>\n\n' +
          'На данный момент запланированных событий нет.\n\n' +
          '<i>Следи за обновлениями — скоро появятся новые вебинары и курсы!</i>'
        );
        return;
      }
      
      let message = '📅 <b>Ближайшие события</b>\n\n';
      
      webinars.forEach((webinar, index) => {
        const date = new Date(webinar.schedule_time).toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        message += `${index + 1}. <b>${webinar.title}</b>\n`;
        message += `   📍 ${date}\n`;
        message += `   👨‍🏫 ${webinar.instructor}\n`;
        message += `   ⏱ ${webinar.duration} минут\n\n`;
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
  }
}

module.exports = BotController;

// БАЗОВЫЙ КЛАСС ДЛЯ ВСЕХ БОТОВ

class BaseBot {
  constructor(platform, token) {
    this.platform = platform;
    this.token = token;
    this.sessions = new Map();      // Хранилище сессий
    this.handlers = new Map();      // Команды и их обработчики
    this.callbackHandlers = new Map(); // Callback обработчики
  }

  // ============================================================
  // РЕГИСТРАЦИЯ КОМАНД
  // ============================================================
  
  registerCommand(command, handler) {
    this.handlers.set(command, handler);
    return this;
  }

  registerCallback(payload, handler) {
    this.callbackHandlers.set(payload, handler);
    return this;
  }

  // ============================================================
  // ГЛАВНЫЙ ОБРАБОТЧИК СООБЩЕНИЙ
  // ============================================================
  
  async handleMessage(userId, text, payload = null) {
    try {
      // 1. Получаем пользователя
      const user = await this.getOrCreateUser(userId);
      
      // 2. Если есть payload - обрабатываем callback
      if (payload) {
        return await this.handleCallback(user, payload);
      }
      
      // 3. Если команда - обрабатываем команду
      if (text && text.startsWith('/')) {
        const command = text.split(' ')[0].toLowerCase();
        const handler = this.handlers.get(command);
        if (handler) {
          return await handler(user, text);
        }
      }
      
      // 4. Всё остальное - обычный текст
      return await this.handleText(user, text);
      
    } catch (error) {
      console.error(`[${this.platform}] Error:`, error);
      await this.sendMessage(
        userId,
        '❌ Произошла ошибка. Попробуйте позже.'
      );
    }
  }

  // ============================================================
  // ОБРАБОТКА CALLBACK
  // ============================================================
  
  async handleCallback(user, payload) {
    // Проверяем, есть ли обработчик
    const handler = this.callbackHandlers.get(payload);
    if (handler) {
      return await handler(user, payload);
    }
    
    // Обработка по префиксам
    if (payload.startsWith('lesson_')) {
      const lessonId = payload.replace('lesson_', '');
      return await this.sendLesson(user, lessonId);
    }
    
    if (payload.startsWith('test_') && !payload.startsWith('test_answer_')) {
      const testId = payload.replace('test_', '');
      return await this.showTest(user, testId);
    }
    
    if (payload.startsWith('test_answer_')) {
      const parts = payload.replace('test_answer_', '').split('_');
      const testId = parts[0];
      const answerId = parts[1];
      return await this.handleTestAnswer(user, testId, answerId);
    }
    
    if (payload.startsWith('payment_check_')) {
      const paymentId = payload.replace('payment_check_', '');
      return await this.handlePaymentCheck(user, paymentId);
    }
    
    // Админ-панель
    if (payload.startsWith('admin_')) {
      return await this.handleAdminCallback(user, payload);
    }
    
    // Стандартные callback
    switch (payload) {
      case 'show_courses':
        return await this.showCourses(user);
      case 'show_help':
        return await this.sendHelp(user);
      case 'buy_access':
        return await this.buyAccess(user);
      case 'main_menu':
        return await this.sendStartMenu(user);
      case 'admin_panel':
        return await this.showAdminLogin(user);
      default:
        await this.sendMessage(
          user.chat_id,
          `❓ Неизвестная команда: ${payload}`
        );
    }
  }

  // ============================================================
  // ВИРТУАЛЬНЫЕ МЕТОДЫ (ПЕРЕОПРЕДЕЛЯЮТСЯ В НАСЛЕДНИКАХ)
  // ============================================================
  
  async sendMessage(chatId, text, options = {}) {
    throw new Error('sendMessage должен быть переопределен');
  }

  async sendKeyboard(chatId, text, buttons, options = {}) {
    throw new Error('sendKeyboard должен быть переопределен');
  }

  async getOrCreateUser(userId) {
    throw new Error('getOrCreateUser должен быть переопределен');
  }

  async handleText(user, text) {
    // По умолчанию - показываем меню
    return await this.sendStartMenu(user);
  }

  // ============================================================
  // ОБЩИЕ КОМАНДЫ (ДЛЯ ВСЕХ ПЛАТФОРМ)
  // ============================================================
  
  async sendStartMenu(user) {
    const hasAccess = await this.checkAccess(user.id);
    
    const text = '👋 **Добро пожаловать в обучающий бот!**\n\nВыберите действие:';
    const buttons = [
      [{ type: 'callback', text: '📚 Уроки', payload: 'show_courses' }]
    ];
    
    if (!hasAccess) {
      buttons.push([{ type: 'callback', text: '💳 Купить доступ', payload: 'buy_access' }]);
    }
    buttons.push([{ type: 'callback', text: '❓ Помощь', payload: 'show_help' }]);
    
    return await this.sendKeyboard(user.chat_id, text, buttons);
  }

  async sendHelp(user) {
    const text = `📚 **Помощь**

/start - Главное меню
/help - Помощь
/courses - Уроки
/admin - Админ-панель

Просто напиши сообщение, и я помогу!`;
    
    return await this.sendMessage(user.chat_id, text);
  }

  // ============================================================
  // УРОКИ (ОБЩАЯ ЛОГИКА)
  // ============================================================
  
  async showCourses(user) {
    const hasAccess = await this.checkAccess(user.id);
    const lessons = hasAccess 
      ? await this.getAllLessons() 
      : await this.getFreeLessons();
    
    if (!lessons || lessons.length === 0) {
      const text = hasAccess
        ? '📚 **Уроки**\n\nПока нет уроков. Загляните позже!'
        : '📚 **Бесплатные уроки**\n\nПока нет бесплатных уроков.\n\n💳 Купите доступ к полному курсу!';
      
      const buttons = hasAccess
        ? [[{ type: 'callback', text: '❓ Помощь', payload: 'show_help' }]]
        : [
            [{ type: 'callback', text: '💳 Купить доступ', payload: 'buy_access' }],
            [{ type: 'callback', text: '❓ Помощь', payload: 'show_help' }]
          ];
      
      return await this.sendKeyboard(user.chat_id, text, buttons);
    }
    
    const text = hasAccess ? '📚 **Все уроки**' : '📚 **Бесплатные уроки**';
    const buttons = [];
    
    for (const lesson of lessons) {
      const icon = '📖';
      const isFree = lesson.is_free ? '🆓' : '🔒';
      buttons.push([
        { 
          type: 'callback', 
          text: `${icon} ${lesson.title.substring(0, 25)} ${isFree}`,
          payload: `lesson_${lesson.id}` 
        }
      ]);
    }
    
    if (!hasAccess) {
      buttons.push([{ type: 'callback', text: '💳 Купить доступ', payload: 'buy_access' }]);
    }
    buttons.push([{ type: 'callback', text: '❓ Помощь', payload: 'show_help' }]);
    
    return await this.sendKeyboard(user.chat_id, text + '\n\nВыберите урок:', buttons);
  }

  async sendLesson(user, lessonId) {
    const lesson = await this.getLesson(lessonId);
    if (!lesson) {
      return await this.sendMessage(
        user.chat_id,
        '❌ Урок не найден'
      );
    }
    
    // Проверяем доступ
    if (!lesson.is_free) {
      const hasAccess = await this.checkAccess(user.id);
      if (!hasAccess) {
        return await this.sendKeyboard(
          user.chat_id,
          `🔒 **Этот урок платный**\n\n"${lesson.title}" доступен только после покупки.\n\n💳 Купите доступ чтобы открыть все уроки!`,
          [
            [{ type: 'callback', text: '💳 Купить доступ', payload: 'buy_access' }],
            [{ type: 'callback', text: '📚 Назад к урокам', payload: 'show_courses' }]
          ]
        );
      }
    }
    
    // Отправляем описание
    await this.sendMessage(
      user.chat_id,
      `📖 **${lesson.title}**\n\n${lesson.description || 'Нет описания'}`
    );
    
    // Отправляем видео (если есть)
    if (lesson.video_token) {
      await this.sendVideoByToken(user.chat_id, lesson.video_token, lesson.title);
    }
    
    // Отправляем файлы
    if (lesson.files && lesson.files.length > 0) {
      for (const file of lesson.files) {
        if (file.type !== 'video' && file.token) {
          await this.sendFileByToken(user.chat_id, file.token, file.original_name);
        }
      }
    }
    
    // Тест
    const test = await this.getLessonTest(lessonId);
    if (test && test.answers && test.answers.length > 0) {
      const buttons = [
        [{ type: 'callback', text: '✅ Проверить себя', payload: `test_${test.id}` }],
        [{ type: 'callback', text: '📚 Назад к урокам', payload: 'show_courses' }]
      ];
      return await this.sendKeyboard(
        user.chat_id,
        `📝 **Проверь себя!**\n\nПройти тест по уроку "${lesson.title}"`,
        buttons
      );
    }
    
    // Возврат к урокам
    const buttons = [
      [{ type: 'callback', text: '📚 Назад к урокам', payload: 'show_courses' }]
    ];
    return await this.sendKeyboard(
      user.chat_id,
      `✅ Урок завершён!\n\nВы изучили "${lesson.title}"`,
      buttons
    );
  }

  // ============================================================
  // ТЕСТЫ (ОБЩАЯ ЛОГИКА)
  // ============================================================
  
  async showTest(user, testId) {
    const test = await this.getTest(testId);
    if (!test || !test.answers || test.answers.length === 0) {
      return await this.sendMessage(
        user.chat_id,
        '❌ Тест не найден или не имеет вариантов ответов'
      );
    }
    
    // Перемешиваем ответы
    const shuffled = [...test.answers].sort(() => Math.random() - 0.5);
    const buttons = shuffled.map(answer => [
      { 
        type: 'callback', 
        text: answer.answer || 'Вариант',
        payload: `test_answer_${testId}_${answer.id}` 
      }
    ]);
    
    buttons.push([
      { type: 'callback', text: '⬅️ Назад к уроку', payload: `lesson_${test.lesson_id}` }
    ]);
    
    return await this.sendKeyboard(
      user.chat_id,
      `📝 **${test.question || 'Проверьте знания'}**\n\nВыберите правильный ответ:`,
      buttons
    );
  }

  async handleTestAnswer(user, testId, answerId) {
    const test = await this.getTest(testId);
    if (!test) {
      return await this.sendMessage(user.chat_id, '❌ Тест не найден');
    }
    
    const selected = test.answers.find(a => a.id === answerId);
    const isCorrect = selected && selected.is_correct;
    
    if (isCorrect) {
      // Отмечаем урок как пройденный
      await this.markLessonCompleted(user.id, test.lesson_id);
      
      await this.sendMessage(
        user.chat_id,
        '✅ **Правильно!** 🎉\n\nОтличная работа! Вы успешно прошли тест.'
      );
      return await this.showCourses(user);
    } else {
      const correct = test.answers.find(a => a.is_correct);
      await this.sendMessage(
        user.chat_id,
        `❌ **Неправильно.**\n\nПравильный ответ: ${correct ? correct.answer : 'Неизвестно'}\n\nПопробуйте еще раз!`
      );
      return await this.showTest(user, testId);
    }
  }

  // ============================================================
  // ПОКУПКА ДОСТУПА (ОБЩАЯ ЛОГИКА)
  // ============================================================
  
  async buyAccess(user) {
    // Проверяем, есть ли уже доступ
    const hasAccess = await this.checkAccess(user.id);
    if (hasAccess) {
      await this.sendMessage(
        user.chat_id,
        '✅ У вас уже есть доступ ко всем урокам!'
      );
      return await this.showCourses(user);
    }
    
    const price = 999;
    const payment = await this.createPayment(user.id, price);
    
    const text = `💳 **Купить доступ к полному курсу**\n\n` +
      `💰 Стоимость: ${price} руб.\n` +
      `🆔 Платеж: ${payment.id}\n\n` +
      `Для оплаты переведите ${price} руб на карту:\n` +
      `**XXXX XXXX XXXX XXXX**\n\n` +
      `После оплаты нажмите кнопку "Я оплатил(а)"\n` +
      `Укажите номер платежа: ${payment.id}`;
    
    const buttons = [
      [{ type: 'callback', text: '✅ Я оплатил(а)', payload: `payment_check_${payment.id}` }],
      [{ type: 'callback', text: '📚 Назад к урокам', payload: 'show_courses' }]
    ];
    
    return await this.sendKeyboard(user.chat_id, text, buttons);
  }

  async handlePaymentCheck(user, paymentId) {
    const payment = await this.getPayment(paymentId);
    if (!payment) {
      return await this.sendMessage(
        user.chat_id,
        '❌ Платеж не найден'
      );
    }
    
    if (payment.status === 'success') {
      await this.sendMessage(
        user.chat_id,
        '✅ **Оплата подтверждена!**\n\nДоступ к курсам открыт. Начинайте обучение! 📚'
      );
      return await this.showCourses(user);
    }
    
    if (payment.status === 'pending') {
      return await this.sendMessage(
        user.chat_id,
        '⏳ **Платеж в обработке...**\n\nПожалуйста, подождите или проверьте позже.'
      );
    }
    
    return await this.sendMessage(
      user.chat_id,
      '❌ **Платеж не прошел**\n\nПопробуйте еще раз или свяжитесь с поддержкой.'
    );
  }

  // ============================================================
  // АДМИН-ПАНЕЛЬ (ОБЩАЯ ЛОГИКА)
  // ============================================================
  
  async showAdminLogin(user) {
    const session = this.sessions.get(user.chat_id);
    if (session && session.mode === 'admin') {
      return await this.showAdminDashboard(user);
    }
    
    this.sessions.set(user.chat_id, { mode: 'awaiting_password' });
    return await this.sendMessage(
      user.chat_id,
      '🔐 **Введите пароль администратора**\n\nОтправьте пароль сообщением.'
    );
  }

  async handleAdminLogin(user, password) {
    const bcrypt = require('bcryptjs');
    const admins = await this.getAdmins();
    
    let admin = null;
    for (const a of admins) {
      if (await bcrypt.compare(password, a.password_hash)) {
        admin = a;
        break;
      }
    }
    
    if (!admin) {
      this.sessions.delete(user.chat_id);
      return await this.sendMessage(
        user.chat_id,
        '❌ **Неверный пароль!** Попробуйте снова через /admin'
      );
    }
    
    this.sessions.set(user.chat_id, {
      mode: 'admin',
      adminId: admin.id,
      login: admin.login,
      role: admin.role,
      context: 'dashboard'
    });
    
    await this.sendMessage(
      user.chat_id,
      `✅ **Добро пожаловать в админ-панель, ${admin.login}!**`
    );
    
    return await this.showAdminDashboard(user);
  }

  async showAdminDashboard(user) {
    const session = this.sessions.get(user.chat_id);
    if (!session || session.mode !== 'admin') {
      return await this.showAdminLogin(user);
    }
    
    const stats = await this.getStats();
    
    const text = `🔐 **Админ-панель**\n\n` +
      `👤 ${session.login} (${session.role})\n` +
      `📚 Курсов: ${stats.courses}\n` +
      `📖 Уроков: ${stats.lessons}\n` +
      `👥 Пользователей: ${stats.users}\n` +
      `💳 Купили доступ: ${stats.paidUsers}\n`;
    
    const buttons = [
      [{ type: 'callback', text: '➕ Создать урок', payload: 'admin_create_lesson' }],
      [{ type: 'callback', text: '📝 Редактировать уроки', payload: 'admin_edit_lessons' }],
      [{ type: 'callback', text: '📊 Статистика', payload: 'admin_stats' }],
      [{ type: 'callback', text: '🚪 Выйти', payload: 'admin_logout' }]
    ];
    
    return await this.sendKeyboard(user.chat_id, text, buttons);
  }

  async handleAdminCallback(user, payload) {
    const session = this.sessions.get(user.chat_id);
    if (!session || session.mode !== 'admin') {
      return await this.showAdminLogin(user);
    }
    
    if (payload === 'admin_logout') {
      this.sessions.delete(user.chat_id);
      return await this.sendMessage(
        user.chat_id,
        '🚪 Вы вышли из админ-панели.'
      );
    }
    
    if (payload === 'admin_back') {
      session.context = 'dashboard';
      return await this.showAdminDashboard(user);
    }
    
    if (payload === 'admin_create_lesson') {
      session.context = 'creating_lesson';
      return await this.sendMessage(
        user.chat_id,
        '📝 **Создание урока**\n\nВведите название урока:'
      );
    }
    
    if (payload === 'admin_stats') {
      const stats = await this.getStats();
      const text = `📊 **Статистика**\n\n` +
        `👥 Пользователей: ${stats.users}\n` +
        `📚 Курсов: ${stats.courses}\n` +
        `📖 Уроков: ${stats.lessons}\n` +
        `✅ Пройдено уроков: ${stats.completedLessons}\n` +
        `💳 Платежей: ${stats.payments}\n` +
        `💰 Выручка: ${stats.revenue} ₽`;
      
      const buttons = [
        [{ type: 'callback', text: '⬅️ Назад', payload: 'admin_back' }]
      ];
      return await this.sendKeyboard(user.chat_id, text, buttons);
    }
    
    if (payload === 'admin_edit_lessons') {
      const lessons = await this.getAllLessons();
      if (lessons.length === 0) {
        return await this.sendMessage(
          user.chat_id,
          '📝 Нет созданных уроков.'
        );
      }
      
      let text = '📝 **Редактирование уроков**\n\nВыберите урок:\n\n';
      const buttons = [];
      
      for (const lesson of lessons) {
        const isFree = lesson.is_free ? '🆓' : '🔒';
        text += `📖 ${lesson.title} ${isFree}\n`;
        buttons.push([
          { type: 'callback', text: `✏️ ${lesson.title.substring(0, 25)}`, payload: `admin_edit_lesson_${lesson.id}` }
        ]);
      }
      
      buttons.push([{ type: 'callback', text: '⬅️ Назад', payload: 'admin_back' }]);
      return await this.sendKeyboard(user.chat_id, text, buttons);
    }
    
    if (payload.startsWith('admin_edit_lesson_')) {
      const lessonId = payload.replace('admin_edit_lesson_', '');
      return await this.showAdminLessonDetail(user, lessonId);
    }
    
    if (payload.startsWith('admin_lesson_edit_title_')) {
      const lessonId = payload.replace('admin_lesson_edit_title_', '');
      session.context = 'editing_title';
      session.lessonId = lessonId;
      return await this.sendMessage(
        user.chat_id,
        '✏️ Введите новое название урока:'
      );
    }
    
    if (payload.startsWith('admin_lesson_edit_desc_')) {
      const lessonId = payload.replace('admin_lesson_edit_desc_', '');
      session.context = 'editing_desc';
      session.lessonId = lessonId;
      return await this.sendMessage(
        user.chat_id,
        '✏️ Введите новое описание урока:'
      );
    }
    
    if (payload.startsWith('admin_lesson_toggle_free_')) {
      const lessonId = payload.replace('admin_lesson_toggle_free_', '');
      const lesson = await this.getLesson(lessonId);
      if (lesson) {
        await this.updateLesson(lessonId, { is_free: !lesson.is_free });
      }
      return await this.showAdminLessonDetail(user, lessonId);
    }
    
    if (payload.startsWith('admin_lesson_delete_')) {
      const lessonId = payload.replace('admin_lesson_delete_', '');
      const lesson = await this.getLesson(lessonId);
      if (lesson) {
        const buttons = [
          [{ type: 'callback', text: '✅ Да', payload: `admin_lesson_delete_confirm_${lessonId}` }],
          [{ type: 'callback', text: '❌ Нет', payload: `admin_edit_lesson_${lessonId}` }]
        ];
        return await this.sendKeyboard(
          user.chat_id,
          `⚠️ Удалить урок "${lesson.title}"?`,
          buttons
        );
      }
    }
    
    if (payload.startsWith('admin_lesson_delete_confirm_')) {
      const lessonId = payload.replace('admin_lesson_delete_confirm_', '');
      await this.deleteLesson(lessonId);
      await this.sendMessage(user.chat_id, '🗑️ Урок удален.');
      return await this.handleAdminCallback(user, 'admin_edit_lessons');
    }
    
    return await this.showAdminDashboard(user);
  }

  async showAdminLessonDetail(user, lessonId) {
    const lesson = await this.getLesson(lessonId);
    if (!lesson) {
      return await this.sendMessage(user.chat_id, '❌ Урок не найден');
    }
    
    const files = await this.getLessonFiles(lessonId);
    const hasVideo = files.find(f => f.type === 'video');
    const hasFile = files.find(f => f.type === 'file');
    
    const text = `📝 **Редактирование урока**\n\n` +
      `📖 **${lesson.title}**\n\n` +
      `📝 Описание: ${lesson.description || 'Нет'}\n` +
      `🆓 ${lesson.is_free ? 'Бесплатный' : 'Платный'}\n` +
      `🎬 Видео: ${hasVideo ? '✅ Есть' : '❌ Нет'}\n` +
      `📎 Файл: ${hasFile ? '✅ Есть' : '❌ Нет'}`;
    
    const buttons = [
      [{ type: 'callback', text: '✏️ Изменить название', payload: `admin_lesson_edit_title_${lessonId}` }],
      [{ type: 'callback', text: '✏️ Изменить описание', payload: `admin_lesson_edit_desc_${lessonId}` }],
      [{ type: 'callback', text: lesson.is_free ? '🔒 Сделать платным' : '🆓 Сделать бесплатным', payload: `admin_lesson_toggle_free_${lessonId}` }],
      [{ type: 'callback', text: '🗑️ Удалить урок', payload: `admin_lesson_delete_${lessonId}` }],
      [{ type: 'callback', text: '⬅️ Назад', payload: 'admin_edit_lessons' }]
    ];
    
    return await this.sendKeyboard(user.chat_id, text, buttons);
  }

  // ============================================================
  // ВИРТУАЛЬНЫЕ МЕТОДЫ ДЛЯ ПЕРЕОПРЕДЕЛЕНИЯ
  // ============================================================
  
  // Платформенно-специфичные
  async sendVideoByToken(chatId, token, title) {
    // По умолчанию - отправляем ссылку
    return await this.sendMessage(chatId, `🎬 Видео: ${title}\nТокен: ${token}`);
  }

  async sendFileByToken(chatId, token, filename) {
    return await this.sendMessage(chatId, `📎 Файл: ${filename}\nТокен: ${token}`);
  }

  // Бизнес-логика (должны быть переопределены)
  async checkAccess(userId) { return false; }
  async getOrCreateUser(userId) { return { id: userId, chat_id: userId }; }
  async getAllLessons() { return []; }
  async getFreeLessons() { return []; }
  async getLesson(lessonId) { return null; }
  async getLessonFiles(lessonId) { return []; }
  async getLessonTest(lessonId) { return null; }
  async getTest(testId) { return null; }
  async updateLesson(lessonId, data) {}
  async deleteLesson(lessonId) {}
  async markLessonCompleted(userId, lessonId) {}
  async createPayment(userId, amount) { return { id: 'test', status: 'pending' }; }
  async getPayment(paymentId) { return null; }
  async getAdmins() { return []; }
  async getStats() { return { courses: 0, lessons: 0, users: 0, paidUsers: 0, completedLessons: 0, payments: 0, revenue: 0 }; }
}

module.exports = BaseBot;

// VK БОТ

const BaseBot = require('./BaseBot');
const config = require('../config');

class VKBot extends BaseBot {
  constructor(token, groupId) {
    super('vk', token);
    this.groupId = groupId;
    this.apiVersion = config.vk.apiVersion || '5.131';
    this.baseUrl = 'https://api.vk.com/method';
    this.confirmationToken = config.vk.confirmationToken || 'f8803dfc';
    
    // Регистрируем команды
    this.registerCommand('/start', this.sendStartMenu.bind(this));
    this.registerCommand('/help', this.sendHelp.bind(this));
    this.registerCommand('/courses', this.showCourses.bind(this));
    this.registerCommand('/admin', this.showAdminLogin.bind(this));
  }

  // ============================================================
  // ОТПРАВКА СООБЩЕНИЙ
  // ============================================================
  
  async sendMessage(chatId, text, options = {}) {
    try {
      const params = new URLSearchParams({
        user_id: chatId,
        message: text || ' ',
        random_id: Math.floor(Math.random() * 2147483647),
        access_token: this.token,
        v: this.apiVersion
      });
      
      if (options.attachments && options.attachments.length > 0) {
        params.append('attachment', options.attachments.join(','));
      }
      
      const response = await fetch(`${this.baseUrl}/messages.send?${params}`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.error) {
        throw new Error(`VK API Error: ${data.error.error_msg}`);
      }
      
      return data;
    } catch (error) {
      console.error('[VK] Send error:', error.message);
      throw error;
    }
  }

  async sendKeyboard(chatId, text, buttons, options = {}) {
    try {
      const vkButtons = buttons.map(row =>
        row.map(btn => ({
          action: {
            type: 'text',
            label: btn.text || 'Кнопка',
            payload: JSON.stringify({ payload: btn.payload || '' })
          },
          color: this.getButtonColor(btn)
        }))
      );
      
      const keyboard = {
        one_time: false,
        buttons: vkButtons
      };
      
      const params = new URLSearchParams({
        user_id: chatId,
        message: text || ' ',
        keyboard: JSON.stringify(keyboard),
        random_id: Math.floor(Math.random() * 2147483647),
        access_token: this.token,
        v: this.apiVersion
      });
      
      const response = await fetch(`${this.baseUrl}/messages.send?${params}`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.error) {
        throw new Error(`VK API Error: ${data.error.error_msg}`);
      }
      
      return data;
    } catch (error) {
      console.error('[VK] Send keyboard error:', error.message);
      // Fallback на обычное сообщение
      return await this.sendMessage(chatId, text + '\n\n' + buttons.map(row => row.map(b => b.text).join(' | ')).join('\n'));
    }
  }

  getButtonColor(btn) {
    if (btn.color) return btn.color;
    if (btn.payload === 'admin_panel' || btn.payload === 'admin_login') return 'negative';
    if (btn.payload === 'buy_access' || btn.payload === 'payment_confirmed') return 'positive';
    return 'primary';
  }

  async sendVideoByToken(chatId, token, title = '') {
    // VK не поддерживает отправку по токену напрямую
    // Отправляем ссылку
    return await this.sendMessage(
      chatId,
      `🎬 **${title || 'Видео'}**\n\nВидео доступно по ссылке.`
    );
  }

  async sendFileByToken(chatId, token, filename = 'file') {
    return await this.sendMessage(
      chatId,
      `📎 **${filename}**\n\nФайл доступен по ссылке.`
    );
  }

  // ============================================================
  // ВЕБХУК
  // ============================================================
  
  async webhookHandler(req, res) {
    console.log('[VK WEBHOOK] ========== WEBHOOK RECEIVED ==========');
    
    try {
      const { type, secret, object, group_id } = req.body;
      
      console.log('[VK WEBHOOK] Type:', type);
      console.log('[VK WEBHOOK] Group ID:', group_id);
      
      // Проверка секрета
      if (secret && config.vk.secret && secret !== config.vk.secret) {
        console.warn('[VK WEBHOOK] ❌ Invalid secret');
        return res.status(403).send('Invalid secret');
      }
      
      switch (type) {
        case 'confirmation':
          console.log('[VK WEBHOOK] 🔑 Confirmation request');
          return res.status(200).type('text/plain').send(this.confirmationToken);
        
        case 'message_new':
          console.log('[VK WEBHOOK] 📨 New message');
          res.status(200).send('ok');
          
          setImmediate(async () => {
            try {
              const message = object.message || {};
              const userId = String(message.from_id);
              const text = message.text || '';
              let payload = null;
              
              if (message.payload) {
                try {
                  const parsed = JSON.parse(message.payload);
                  payload = parsed.payload || null;
                } catch (e) {}
              }
              
              console.log(`[VK] Message from ${userId}: "${text}", payload: ${payload}`);
              
              // Проверяем админ-пароль
              const session = this.sessions.get(userId);
              if (session && session.mode === 'awaiting_password') {
                const user = await this.getOrCreateUser(userId);
                return await this.handleAdminLogin(user, text);
              }
              
              if (userId) {
                const user = await this.getOrCreateUser(userId);
                await this.handleMessage(userId, text, payload);
              }
            } catch (error) {
              console.error('[VK WEBHOOK] Error processing message:', error);
            }
          });
          return;
        
        case 'message_event':
          console.log('[VK WEBHOOK] 🎯 Event');
          res.status(200).send('ok');
          
          setImmediate(async () => {
            try {
              const userId = String(object.user_id || object.message?.from_id);
              let payload = null;
              
              if (object.payload) {
                try {
                  const parsed = typeof object.payload === 'string'
                    ? JSON.parse(object.payload)
                    : object.payload;
                  payload = parsed.payload || null;
                } catch (e) {}
              }
              
              console.log(`[VK] Event from ${userId}, payload: ${payload}`);
              
              if (userId) {
                const user = await this.getOrCreateUser(userId);
                await this.handleCallback(user, payload);
              }
            } catch (error) {
              console.error('[VK WEBHOOK] Error processing event:', error);
            }
          });
          return;
        
        default:
          console.log(`[VK WEBHOOK] Unhandled type: ${type}`);
          return res.status(200).send('ok');
      }
    } catch (error) {
      console.error('[VK WEBHOOK] Fatal error:', error);
      return res.status(200).send('ok');
    }
  }

  // ============================================================
  // БИЗНЕС-ЛОГИКА (ПОДКЛЮЧЕНИЕ К СЕРВИСАМ)
  // ============================================================
  
  setServices({ userService, courseService, lessonService, paymentService, database }) {
    this.userService = userService;
    this.courseService = courseService;
    this.lessonService = lessonService;
    this.paymentService = paymentService;
    this.database = database;
    return this;
  }

  async getOrCreateUser(userId) {
    if (!this.userService) {
      return { id: userId, chat_id: userId, platform: 'vk' };
    }
    try {
      return await this.userService.registerUser({
        platform_user_id: String(userId),
        platform: 'vk',
        chat_id: String(userId)
      });
    } catch (error) {
      console.error('[VK] getOrCreateUser error:', error);
      return { id: userId, chat_id: userId, platform: 'vk' };
    }
  }

  async checkAccess(userId) {
    if (!this.courseService) return false;
    try {
      return await this.courseService.checkUserCourseAccess(userId, 'course_1');
    } catch {
      return false;
    }
  }

  async getAllLessons() {
    if (!this.lessonService) return [];
    try {
      const lessons = await this.lessonService.getAllLessons();
      return lessons.filter(l => l.platform === 'vk' || !l.platform);
    } catch {
      return [];
    }
  }

  async getFreeLessons() {
    if (!this.lessonService) return [];
    try {
      const lessons = await this.lessonService.getFreeLessons();
      return lessons.filter(l => l.platform === 'vk' || !l.platform);
    } catch {
      return [];
    }
  }

  async getLesson(lessonId) {
    if (!this.lessonService) return null;
    try {
      return await this.lessonService.getLessonWithFiles(lessonId);
    } catch {
      return null;
    }
  }

  async getLessonFiles(lessonId) {
    if (!this.lessonService) return [];
    try {
      return await this.lessonService.getLessonFiles(lessonId);
    } catch {
      return [];
    }
  }

  async getLessonTest(lessonId) {
    if (!this.lessonService) return null;
    try {
      return await this.lessonService.getLessonTest(lessonId);
    } catch {
      return null;
    }
  }

  async getTest(testId) {
    if (!this.lessonService) return null;
    try {
      return await this.lessonService.getTestById(testId);
    } catch {
      return null;
    }
  }

  async updateLesson(lessonId, data) {
    if (!this.lessonService) return;
    try {
      await this.lessonService.updateLesson(lessonId, data);
    } catch (error) {
      console.error('[VK] updateLesson error:', error);
    }
  }

  async deleteLesson(lessonId) {
    if (!this.lessonService) return;
    try {
      await this.lessonService.deleteLesson(lessonId);
    } catch (error) {
      console.error('[VK] deleteLesson error:', error);
    }
  }

  async markLessonCompleted(userId, lessonId) {
    if (!this.lessonService) return;
    try {
      const progressData = await this.database.readTable('progress');
      const existing = progressData.find(p => p.user_id === userId && p.lesson_id === lessonId);
      
      if (existing) {
        existing.status = 'completed';
        existing.completed_at = new Date().toISOString();
      } else {
        progressData.push({
          id: require('uuid').v4(),
          user_id: userId,
          lesson_id: lessonId,
          status: 'completed',
          completed_at: new Date().toISOString()
        });
      }
      await this.database.writeTable('progress', progressData);
    } catch (error) {
      console.error('[VK] markLessonCompleted error:', error);
    }
  }

  async createPayment(userId, amount) {
    if (!this.paymentService) {
      return { id: 'test', status: 'pending' };
    }
    try {
      return await this.paymentService.createPayment(userId, amount);
    } catch (error) {
      console.error('[VK] createPayment error:', error);
      return { id: 'test', status: 'pending' };
    }
  }

  async getPayment(paymentId) {
    if (!this.paymentService) return null;
    try {
      return await this.paymentService.getPaymentById(paymentId);
    } catch {
      return null;
    }
  }

  async getAdmins() {
    if (!this.database) return [];
    try {
      return this.database.readTable('admins') || [];
    } catch {
      return [];
    }
  }

  async getStats() {
    try {
      const users = this.database ? this.database.readTable('users') || [] : [];
      const lessons = this.database ? this.database.readTable('lessons') || [] : [];
      const courses = this.database ? this.database.readTable('courses') || [] : [];
      const payments = this.database ? this.database.readTable('payments') || [] : [];
      const progress = this.database ? this.database.readTable('progress') || [] : [];
      
      const successfulPayments = payments.filter(p => p.status === 'success');
      
      return {
        users: users.length,
        lessons: lessons.length,
        courses: courses.length,
        paidUsers: successfulPayments.length,
        completedLessons: progress.filter(p => p.status === 'completed').length,
        payments: successfulPayments.length,
        revenue: successfulPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
      };
    } catch (error) {
      console.error('[VK] getStats error:', error);
      return { users: 0, lessons: 0, courses: 0, paidUsers: 0, completedLessons: 0, payments: 0, revenue: 0 };
    }
  }

  // ============================================================
  // ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ (АДМИН-КОМАНДЫ)
  // ============================================================
  
  async handleText(user, text) {
    const session = this.sessions.get(user.chat_id);
    
    if (session && session.mode === 'awaiting_password') {
      return await this.handleAdminLogin(user, text);
    }
    
    if (session && session.mode === 'admin') {
      const context = session.context || '';
      
      if (context === 'creating_lesson') {
        session.lessonTitle = text;
        session.context = 'creating_lesson_desc';
        return await this.sendMessage(
          user.chat_id,
          `📝 **Создание урока: "${text}"**\n\nВведите описание урока:`
        );
      }
      
      if (context === 'creating_lesson_desc') {
        const title = session.lessonTitle;
        const description = text;
        
        let courses = await this.courseService?.getAllCourses(false) || [];
        let courseId = courses.find(c => c.platform === 'vk')?.id;
        
        if (!courseId && this.courseService) {
          const course = await this.courseService.createCourse({
            title: 'Основной курс VK',
            description: 'Все уроки для VK',
            price: 0,
            isActive: true,
            platform: 'vk'
          });
          courseId = course.id;
        }
        
        if (this.lessonService) {
          const lesson = await this.lessonService.createLesson({
            courseId: courseId || 'course_1',
            title: title,
            description: description,
            orderNumber: 0,
            isFree: true,
            platform: 'vk'
          });
          
          session.context = 'editing_lesson';
          session.lessonId = lesson.id;
          
          await this.sendMessage(
            user.chat_id,
            `✅ **Урок создан!**\n\n📖 ${lesson.title}\n\nТеперь вы можете настроить его через меню.`
          );
          
          return await this.showAdminLessonDetail(user, lesson.id);
        }
      }
      
      if (context === 'editing_title') {
        const lessonId = session.lessonId;
        if (lessonId && this.lessonService) {
          await this.lessonService.updateLesson(lessonId, { title: text });
          session.context = 'editing_lesson';
          await this.sendMessage(user.chat_id, `✅ Название обновлено: "${text}"`);
          return await this.showAdminLessonDetail(user, lessonId);
        }
      }
      
      if (context === 'editing_desc') {
        const lessonId = session.lessonId;
        if (lessonId && this.lessonService) {
          await this.lessonService.updateLesson(lessonId, { description: text });
          session.context = 'editing_lesson';
          await this.sendMessage(user.chat_id, '✅ Описание обновлено.');
          return await this.showAdminLessonDetail(user, lessonId);
        }
      }
    }
    
    return await this.sendStartMenu(user);
  }
}

module.exports = VKBot;

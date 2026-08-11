// MAX БОТ

const BaseBot = require('./BaseBot');
const fetch = require('node-fetch');
const config = require('../config');

class MaxBot extends BaseBot {
  constructor(token) {
    super('max', token);
    this.apiUrl = config.max.baseUrl || 'https://platform-api2.max.ru';
    
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
      const url = `${this.apiUrl}/messages`;
      const body = {
        chat_id: chatId,
        text: text,
        format: options.parseMode || 'markdown',
        attachments: options.attachments || []
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[MAX] Send error:', error.message);
      throw error;
    }
  }

  async sendKeyboard(chatId, text, buttons, options = {}) {
    const attachment = {
      type: 'inline_keyboard',
      payload: { buttons: buttons }
    };
    
    return await this.sendMessage(chatId, text, {
      ...options,
      attachments: [attachment]
    });
  }

  async sendVideoByToken(chatId, token, title = '') {
    const attachment = {
      type: 'video',
      payload: { token: token }
    };
    
    return await this.sendMessage(chatId, title ? `🎬 **${title}**` : '🎬 Видео', {
      parseMode: 'markdown',
      attachments: [attachment]
    });
  }

  async sendFileByToken(chatId, token, filename = 'file') {
    const attachment = {
      type: 'file',
      payload: { token: token }
    };
    
    return await this.sendMessage(chatId, `📎 **${filename}**`, {
      parseMode: 'markdown',
      attachments: [attachment]
    });
  }

  // ============================================================
  // ВЕБХУК
  // ============================================================
  
  async webhookHandler(req, res) {
    console.log('[MAX WEBHOOK] ========== WEBHOOK RECEIVED ==========');
    
    try {
      const webhookSecret = config.max.webhookSecret;
      if (webhookSecret) {
        const received = req.headers['x-max-bot-api-secret'];
        if (!received || received !== webhookSecret) {
          console.warn('[MAX WEBHOOK] Invalid secret!');
          return res.status(401).send('Unauthorized');
        }
      }
      
      res.status(200).send('ok');
      console.log('[MAX WEBHOOK] Sent 200 OK');
      
      setImmediate(async () => {
        try {
          const update = req.body;
          console.log('[MAX WEBHOOK] Processing update type:', update.update_type);
          
          switch (update.update_type) {
            case 'bot_started':
            case 'bot_added':
              const chatId = update.chat_id || update.message?.recipient?.chat_id;
              const userId = update.user?.user_id || update.message?.sender?.user_id;
              if (userId) {
                const user = await this.getOrCreateUser(userId);
                await this.sendStartMenu(user);
              }
              break;
              
            case 'message_created':
              const message = update.message;
              const text = message?.body?.text || message?.text || '';
              const userId2 = message?.sender?.user_id || update.user?.user_id;
              const attachments = message?.body?.attachments || [];
              
              console.log(`[MAX] Message from ${userId2}: "${text}"`);
              
              // Проверяем админ-пароль
              const session = this.sessions.get(userId2);
              if (session && session.mode === 'awaiting_password') {
                const user = await this.getOrCreateUser(userId2);
                return await this.handleAdminLogin(user, text);
              }
              
              if (userId2) {
                const user = await this.getOrCreateUser(userId2);
                await this.handleMessage(userId2, text);
              }
              break;
              
            case 'message_callback':
              const callback = update.callback;
              const payload = callback?.payload || '';
              const userId3 = update.user?.user_id || update.message?.sender?.user_id;
              
              console.log(`[MAX] Callback: ${payload} from ${userId3}`);
              
              if (userId3) {
                const user = await this.getOrCreateUser(userId3);
                await this.handleCallback(user, payload);
              }
              break;
              
            default:
              console.log(`[MAX] Unhandled update type: ${update.update_type}`);
          }
        } catch (error) {
          console.error('[MAX WEBHOOK] Error processing:', error);
        }
      });
      
    } catch (error) {
      console.error('[MAX WEBHOOK] Fatal error:', error);
      res.status(500).send('Internal server error');
    }
  }

  // ============================================================
  // БИЗНЕС-ЛОГИКА (ПОДКЛЮЧЕНИЕ К СЕРВИСАМ)
  // ============================================================
  
  // Эти методы будут переопределены извне
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
      return { id: userId, chat_id: userId, platform: 'max' };
    }
    try {
      return await this.userService.registerUser({
        platform_user_id: String(userId),
        platform: 'max',
        chat_id: String(userId)
      });
    } catch (error) {
      console.error('[MAX] getOrCreateUser error:', error);
      return { id: userId, chat_id: userId, platform: 'max' };
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
      return lessons.filter(l => l.platform === 'max' || !l.platform);
    } catch {
      return [];
    }
  }

  async getFreeLessons() {
    if (!this.lessonService) return [];
    try {
      const lessons = await this.lessonService.getFreeLessons();
      return lessons.filter(l => l.platform === 'max' || !l.platform);
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
      console.error('[MAX] updateLesson error:', error);
    }
  }

  async deleteLesson(lessonId) {
    if (!this.lessonService) return;
    try {
      await this.lessonService.deleteLesson(lessonId);
    } catch (error) {
      console.error('[MAX] deleteLesson error:', error);
    }
  }

  async markLessonCompleted(userId, lessonId) {
    if (!this.lessonService) return;
    try {
      // Используем progressService
      const progress = this.progressService || require('../core/progress');
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
      console.error('[MAX] markLessonCompleted error:', error);
    }
  }

  async createPayment(userId, amount) {
    if (!this.paymentService) {
      return { id: 'test', status: 'pending' };
    }
    try {
      return await this.paymentService.createPayment(userId, amount);
    } catch (error) {
      console.error('[MAX] createPayment error:', error);
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
      console.error('[MAX] getStats error:', error);
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
        
        // Создаем курс если нет
        let courses = await this.courseService?.getAllCourses(false) || [];
        let courseId = courses.find(c => c.platform === 'max')?.id;
        
        if (!courseId && this.courseService) {
          const course = await this.courseService.createCourse({
            title: 'Основной курс',
            description: 'Все уроки для MAX',
            price: 0,
            isActive: true,
            platform: 'max'
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
            platform: 'max'
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
    
    // Если не админ - показываем меню
    return await this.sendStartMenu(user);
  }
}

module.exports = MaxBot;

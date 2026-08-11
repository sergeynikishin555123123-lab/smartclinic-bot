const database = require('./database');
const fs = require('fs');

class LessonService {
  async createLesson(data) {
    const lessons = database.readTable('lessons');
    const lesson = {
      id: database.generateId(),
      course_id: data.courseId,
      title: data.title,
      description: data.description || '',
      video_token: data.videoToken || '',
      order_number: parseInt(data.orderNumber) || 0,
      is_free: data.isFree || false,
      platform: data.platform || 'max',
      created_at: database.now(),
      updated_at: database.now()
    };
    lessons.push(lesson);
    database.writeTable('lessons', lessons);
    return lesson;
  }

  async getAllLessons() {
    const lessons = database.readTable('lessons');
    return lessons.sort((a, b) => (a.order_number || 0) - (b.order_number || 0));
  }

  async getFreeLessons() {
    const lessons = database.readTable('lessons');
    return lessons.filter(l => l.is_free === true).sort((a, b) => (a.order_number || 0) - (b.order_number || 0));
  }

  async getLessonWithFiles(lessonId) {
    const lessons = database.readTable('lessons');
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return null;
    
    const files = database.readTable('lesson_files').filter(f => f.lesson_id === lessonId);
    return { ...lesson, files };
  }

  async getLessonFiles(lessonId) {
    const files = database.readTable('lesson_files');
    return files.filter(f => f.lesson_id === lessonId);
  }

  async getLessonTest(lessonId) {
    const tests = database.readTable('tests');
    const answers = database.readTable('test_answers');
    const test = tests.find(t => String(t.lesson_id) === String(lessonId));
    if (!test) return null;
    
    const testAnswers = answers.filter(a => String(a.test_id) === String(test.id));
    return { ...test, answers: testAnswers };
  }

  async getTestById(testId) {
    const tests = database.readTable('tests');
    const answers = database.readTable('test_answers');
    const test = tests.find(t => String(t.id) === String(testId));
    if (!test) return null;
    
    const testAnswers = answers.filter(a => String(a.test_id) === String(test.id));
    return { ...test, answers: testAnswers };
  }

  async updateLesson(lessonId, data) {
    const lessons = database.readTable('lessons');
    const index = lessons.findIndex(l => l.id === lessonId);
    if (index === -1) return null;
    
    if (data.title !== undefined) lessons[index].title = data.title;
    if (data.description !== undefined) lessons[index].description = data.description;
    if (data.is_free !== undefined) lessons[index].is_free = data.is_free;
    if (data.platform !== undefined) lessons[index].platform = data.platform;
    
    lessons[index].updated_at = database.now();
    database.writeTable('lessons', lessons);
    return lessons[index];
  }

  async deleteLesson(lessonId) {
    let lessons = database.readTable('lessons');
    lessons = lessons.filter(l => l.id !== lessonId);
    database.writeTable('lessons', lessons);
    
    let files = database.readTable('lesson_files');
    files = files.filter(f => f.lesson_id !== lessonId);
    database.writeTable('lesson_files', files);
    
    return true;
  }

  async addLessonFile(lessonId, fileData) {
    const files = database.readTable('lesson_files');
    const file = {
      id: database.generateId(),
      lesson_id: lessonId,
      type: fileData.type || 'file',
      filename: fileData.filename || 'file',
      original_name: fileData.originalname || fileData.filename || 'file',
      size: fileData.size || 0,
      mime_type: fileData.mimetype || '',
      token: fileData.token || null,
      platform: fileData.platform || 'max',
      created_at: database.now()
    };
    files.push(file);
    database.writeTable('lesson_files', files);
    return file;
  }

  async deleteLessonFile(fileId) {
    let files = database.readTable('lesson_files');
    files = files.filter(f => f.id !== fileId);
    database.writeTable('lesson_files', files);
  }
}

module.exports = new LessonService();

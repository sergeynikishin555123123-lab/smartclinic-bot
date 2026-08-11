const database = require('./database');

class CourseService {
  async getAllCourses(activeOnly = false) {
    const courses = database.readTable('courses');
    const filtered = activeOnly ? courses.filter(c => c.is_active !== false) : courses;
    return filtered.sort((a, b) => (a.order_number || 0) - (b.order_number || 0));
  }

  async getCourseById(courseId) {
    const courses = database.readTable('courses');
    return courses.find(c => c.id === courseId) || null;
  }

  async createCourse(data) {
    const courses = database.readTable('courses');
    const course = {
      id: database.generateId(),
      title: data.title,
      description: data.description || '',
      price: parseFloat(data.price) || 0,
      is_active: data.isActive !== undefined ? data.isActive : true,
      order_number: parseInt(data.orderNumber) || 0,
      platform: data.platform || 'max',
      created_at: database.now(),
      updated_at: database.now()
    };
    courses.push(course);
    database.writeTable('courses', courses);
    return course;
  }

  async checkUserCourseAccess(userId, courseId) {
    const access = database.readTable('user_course_access');
    return access.some(a => String(a.user_id) === String(userId) && a.course_id === courseId);
  }

  async grantCourseAccess(userId, courseId) {
    const access = database.readTable('user_course_access');
    const existing = access.find(a => String(a.user_id) === String(userId) && a.course_id === courseId);
    if (existing) return existing;
    
    const newAccess = {
      id: database.generateId(),
      user_id: String(userId),
      course_id: courseId,
      granted_at: database.now()
    };
    access.push(newAccess);
    database.writeTable('user_course_access', access);
    return newAccess;
  }

  async getPaidCourses() {
    const courses = database.readTable('courses');
    return courses.filter(c => c.price > 0 && c.is_active !== false);
  }
}

module.exports = new CourseService();

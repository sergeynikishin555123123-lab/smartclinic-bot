const database = require('./database');

class UserService {
  async registerUser(data) {
    const users = database.readTable('users');
    const existing = users.find(u => u.platform_user_id === data.platform_user_id && u.platform === data.platform);
    
    if (existing) {
      existing.first_name = data.first_name || existing.first_name;
      existing.last_name = data.last_name || existing.last_name;
      existing.updated_at = database.now();
      database.writeTable('users', users);
      return existing;
    }
    
    const user = {
      id: database.generateId(),
      platform_user_id: String(data.platform_user_id),
      platform: data.platform || 'max',
      first_name: data.first_name || 'Пользователь',
      last_name: data.last_name || '',
      username: data.username || '',
      chat_id: String(data.chat_id || data.platform_user_id),
      created_at: database.now(),
      updated_at: database.now()
    };
    
    users.push(user);
    database.writeTable('users', users);
    return user;
  }

  async getUserByPlatformId(platformUserId) {
    const users = database.readTable('users');
    return users.find(u => String(u.platform_user_id) === String(platformUserId)) || null;
  }
}

module.exports = new UserService();

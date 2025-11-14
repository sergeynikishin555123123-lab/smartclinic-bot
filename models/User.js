const { query } = require('../config/database');

class User {
  static async findByTelegramId(telegramId) {
    const result = await query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0];
  }

  static async createOrUpdate(telegramUser, userData = {}) {
    const result = await query(
      `INSERT INTO users (
        telegram_id, username, first_name, last_name, 
        email, phone, city, specialty, experience, last_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
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
      RETURNING *`,
      [
        telegramUser.id,
        telegramUser.username,
        telegramUser.first_name,
        telegramUser.last_name,
        userData.email,
        userData.phone,
        userData.city,
        userData.specialty,
        userData.experience
      ]
    );
    return result.rows[0];
  }

  static async updateSubscription(userId, subscriptionData) {
    const result = await query(
      `UPDATE users 
       SET subscription_tier = $1, 
           subscription_ends_at = $2,
           auto_renew = $3
       WHERE telegram_id = $4
       RETURNING *`,
      [
        subscriptionData.tier,
        subscriptionData.endsAt,
        subscriptionData.autoRenew,
        userId
      ]
    );
    return result.rows[0];
  }

  static async getActiveUsers() {
    const result = await query(
      'SELECT * FROM users WHERE is_active = true AND last_active > NOW() - INTERVAL \'60 days\''
    );
    return result.rows;
  }

  static async archiveInactiveUsers() {
    const result = await query(
      `UPDATE users 
       SET is_active = false 
       WHERE last_active < NOW() - INTERVAL '60 days' 
       AND is_active = true
       RETURNING id`
    );
    return result.rows;
  }
}

module.exports = User;

const { query } = require('../config/database');

class Content {
  static async findAll(filters = {}) {
    let whereConditions = ['ci.is_active = true'];
    let params = [];
    let paramCount = 0;

    if (filters.category_id) {
      paramCount++;
      whereConditions.push(`ci.category_id = $${paramCount}`);
      params.push(filters.category_id);
    }

    if (filters.content_type) {
      paramCount++;
      whereConditions.push(`ci.content_type = $${paramCount}`);
      params.push(filters.content_type);
    }

    if (filters.is_premium !== undefined) {
      paramCount++;
      whereConditions.push(`ci.is_premium = $${paramCount}`);
      params.push(filters.is_premium);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT 
        ci.*, 
        cc.name as category_name, 
        cc.icon as category_icon, 
        cc.color as category_color
       FROM content_items ci
       JOIN content_categories cc ON ci.category_id = cc.id
       ${whereClause}
       ORDER BY ci.created_at DESC
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, filters.limit || 20, filters.offset || 0]
    );

    return result.rows;
  }

  static async findById(id) {
    const result = await query(
      `SELECT 
        ci.*, 
        cc.name as category_name, 
        cc.icon as category_icon, 
        cc.color as category_color
       FROM content_items ci
       JOIN content_categories cc ON ci.category_id = cc.id
       WHERE ci.id = $1 AND ci.is_active = true`,
      [id]
    );
    return result.rows[0];
  }

  static async getCategories() {
    const result = await query(
      `SELECT * FROM content_categories 
       WHERE is_active = true 
       ORDER BY sort_order, name`
    );
    return result.rows;
  }

  static async getUpcomingWebinars() {
    const result = await query(
      `SELECT * FROM content_items 
       WHERE content_type = 'webinar' 
       AND schedule_time BETWEEN NOW() AND NOW() + INTERVAL '7 days'
       AND is_active = true
       ORDER BY schedule_time`
    );
    return result.rows;
  }
}

module.exports = Content;

require('dotenv').config();

const config = {
  server: {
    port: parseInt(process.env.PORT) || 8080,
    publicUrl: process.env.PUBLIC_URL || 'http://localhost:8080',
  },
  
  session: {
    secret: process.env.SESSION_SECRET || 'default-secret-change-me',
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 86400000,
  },
  
  admin: {
    defaultLogin: process.env.ADMIN_LOGIN || 'admin',
    defaultPassword: process.env.ADMIN_PASSWORD || 'Admin2024!Secure',
  },
  
  max: {
    baseUrl: process.env.MAX_API_URL || 'https://platform-api2.max.ru',
    token: process.env.MAX_BOT_TOKEN || '',
    webhookSecret: process.env.MAX_WEBHOOK_SECRET || 'my_super_secret_webhook_2024_abc123',
  },
  
  vk: {
    groupToken: process.env.VK_GROUP_TOKEN || '',
    confirmationToken: process.env.VK_CONFIRMATION_TOKEN || 'f8803dfc',
    apiVersion: process.env.VK_API_VERSION || '5.131',
    secret: process.env.VK_SECRET || '',
    groupId: process.env.VK_GROUP_ID || '',
  },
  
  storage: {
    type: 'local',
    localPath: process.env.UPLOADS_DIR || '/tmp/uploads',
  },
};

module.exports = config;

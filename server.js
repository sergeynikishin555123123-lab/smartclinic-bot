require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const config = require('./config');
const BotFactory = require('./core/BotFactory');

// ============================================================
// ПОДКЛЮЧЕНИЕ БД
// ============================================================

let pgClient = null;
let pgConnected = false;
const DATA_DIR = process.env.DATA_DIR || '/tmp/data';
const LOG_DIR = process.env.LOG_DIR || '/tmp/logs';
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/tmp/uploads';

// Создаем директории
for (const dir of [DATA_DIR, LOG_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ============================================================
// ПОДКЛЮЧЕНИЕ СЕРВИСОВ
// ============================================================

const database = require('./database');
database.initDatabase();

const userService = require('./core/user');
const courseService = require('./core/course');
const lessonService = require('./core/lesson');
const paymentService = require('./core/payment');

// ============================================================
// СОЗДАНИЕ EXPRESS APP
// ============================================================

const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Сессии
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: config.session.maxAge, httpOnly: true, sameSite: 'lax' }
}));

// ============================================================
// СОЗДАНИЕ БОТОВ
// ============================================================

const maxBot = BotFactory.create('max', { token: config.max.token });
const vkBot = BotFactory.create('vk', { 
  token: config.vk.groupToken,
  groupId: config.vk.groupId
});

// Подключаем сервисы к ботам
maxBot.setServices({ userService, courseService, lessonService, paymentService, database });
vkBot.setServices({ userService, courseService, lessonService, paymentService, database });

// ============================================================
// ВЕБХУКИ
// ============================================================

app.post('/webhook/max', (req, res) => maxBot.webhookHandler(req, res));
app.post('/webhook/vk', (req, res) => vkBot.webhookHandler(req, res));

// ============================================================
// АДМИН-ПАНЕЛЬ
// ============================================================

// Подключаем админ-панель (используем вашу существующую)
const adminRoutes = require('./admin/admin');
app.use('/admin', adminRoutes);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Learning Bot Platform v2',
    status: 'running',
    platforms: ['max', 'vk'],
    postgresql: pgConnected ? 'connected' : 'fallback'
  });
});

// ============================================================
// ЗАПУСК
// ============================================================

const PORT = config.server.port || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 MAX Webhook: ${config.server.publicUrl}/webhook/max`);
  console.log(`📡 VK Webhook: ${config.server.publicUrl}/webhook/vk`);
  console.log(`🔐 Admin panel: ${config.server.publicUrl}/admin`);
  console.log('========================================');
});

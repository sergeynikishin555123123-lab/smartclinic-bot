const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.DATA_DIR || '/tmp/data';

function getTablePath(tableName) {
  return path.join(DATA_DIR, `${tableName}.json`);
}

function initDatabase() {
  const tables = ['users', 'admins', 'courses', 'lessons', 'lesson_files', 'tests', 'test_answers', 'progress', 'payments', 'user_course_access'];
  for (const table of tables) {
    const filePath = getTablePath(table);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([]));
    }
  }
}

function readTable(tableName) {
  try {
    const data = fs.readFileSync(getTablePath(tableName), 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeTable(tableName, data) {
  fs.writeFileSync(getTablePath(tableName), JSON.stringify(data, null, 2));
}

function generateId() {
  return uuidv4();
}

function now() {
  return new Date().toISOString();
}

module.exports = { initDatabase, readTable, writeTable, generateId, now };

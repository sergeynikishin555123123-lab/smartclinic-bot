const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('🚀 Smart Clinic Bot - WORKS!');
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Bot is running',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});

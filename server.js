const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '1kb' }));
// 让 Vercel 能够读取 public 文件夹里的网页
app.use(express.static(path.join(__dirname, 'public')));

// 用全局变量代替数据库，数据存在内存里
let totalPigs = 0;
let todayPigs = 0;

// 简单限频防刷
const ipRequests = {};
const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  if (!ipRequests[ip]) ipRequests[ip] = [];
  ipRequests[ip] = ipRequests[ip].filter(t => now - t < 60000); // 保留最近1分钟
  if (ipRequests[ip].length >= 30) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  ipRequests[ip].push(now);
  next();
};

app.get('/api/health', (req, res) => res.json({ ok: true }));

// 接收接猪数据
app.post('/api/stats/pigs', rateLimit, (req, res) => {
  const { count } = req.body;
  if (typeof count !== 'number' || count < 1 || count > 50) {
    return res.status(400).json({ error: 'Invalid count' });
  }
  totalPigs += count;
  todayPigs += count;
  res.json({ ok: true, totalPigs, todayPigs });
});

// 获取全局数据
app.get('/api/stats', (req, res) => {
  res.json({ totalPigs, todayPigs });
});

// Vercel 需要的启动配置
const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

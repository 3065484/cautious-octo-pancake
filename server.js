
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '1kb' }));
// 关键代码：让服务器能正确加载 public 文件夹里的网页和样式
app.use(express.static(path.join(__dirname, 'public')));

let totalPigs = 0;
let todayPigs = 0;

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/stats/pigs', (req, res) => {
  const { count } = req.body;
  if (typeof count === 'number' && count >= 1 && count <= 50) {
    totalPigs += count;
    todayPigs += count;
    return res.json({ ok: true, totalPigs, todayPigs });
  }
  res.status(400).json({ error: 'Invalid count' });
});

app.get('/api/stats', (req, res) => {
  res.json({ totalPigs, todayPigs });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

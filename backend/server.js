const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const db = require('./database');
const { startWorker, getCampaignStatus } = require('./worker');
const { getLogs, clearLogs } = require('./logger');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.post('/api/validate-token', async (req, res) => {
  const { token } = req.body;
  try {
    const response = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: {
        'Authorization': token,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const u = response.data;
    res.json({
      success: true,
      user: {
        id: u.id,
        username: u.username,
        global_name: u.global_name || u.username,
        discriminator: u.discriminator || '0',
        avatar: u.avatar
      }
    });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Token inválido' });
  }
});

app.post('/api/campaigns', (req, res) => {
  const { token, channel_ids, message, delay_min, delay_max } = req.body;
  db.run(
    `INSERT INTO campaigns (token, channel_ids, message, delay_min, delay_max) VALUES (?, ?, ?, ?, ?)`,
    [token, JSON.stringify(channel_ids), message, delay_min, delay_max],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.get('/api/campaigns', (req, res) => {
  db.all(`SELECT * FROM campaigns WHERE active = 1 ORDER BY id DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({
      ...r,
      channel_ids: JSON.parse(r.channel_ids),
      status: getCampaignStatus(r.id) || 'idle'
    })));
  });
});

app.post('/api/campaigns/:id/start', (req, res) => {
  const id = parseInt(req.params.id);
  startWorker(id);
  res.json({ success: true, campaignId: id });
});

app.get('/api/logs', (req, res) => res.json(getLogs()));
app.post('/api/logs/clear', (req, res) => { clearLogs(); res.json({ success: true }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));

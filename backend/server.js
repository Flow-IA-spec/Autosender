const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const db = require('./database');
const { startWorker } = require('./worker');

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
    res.json({
      success: true,
      user: {
        id: response.data.id,
        username: response.data.username,
        discriminator: response.data.discriminator,
        avatar: response.data.avatar
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
  db.all(`SELECT * FROM campaigns WHERE active = 1`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, channel_ids: JSON.parse(r.channel_ids) })));
  });
});

app.post('/api/campaigns/:id/start', (req, res) => {
  startWorker(parseInt(req.params.id));
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));

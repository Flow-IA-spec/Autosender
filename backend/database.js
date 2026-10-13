const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'selfbot.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL,
    channel_ids TEXT NOT NULL,
    message TEXT NOT NULL,
    delay_min INTEGER DEFAULT 8,
    delay_max INTEGER DEFAULT 15,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

module.exports = db;

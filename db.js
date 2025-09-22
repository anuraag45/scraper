// backend/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'scraper.db');

function init() {
  if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT,
        url TEXT,
        pages INTEGER,
        item_count INTEGER,
        csv_path TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER,
        title TEXT,
        price TEXT,
        price_num REAL,
        availability TEXT,
        category TEXT,
        formatted_html TEXT,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      )
    `);
  });
  db.close();
}

module.exports = { init, dbPath };

// backend/server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const { scrape } = require('./scraper');
const { init, dbPath } = require('./db');
const sqlite3 = require('sqlite3').verbose();
const { formatDistanceToNow } = require('date-fns');
const bodyParser = require('body-parser');
const cors = require('cors');
const { parse } = require('json2csv');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

init();
const db = new sqlite3.Database(dbPath);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ensure data dir
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// helper SSE send with optional flush
function sseSend(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  } catch (e) { /* ignore */ }
}

// POST /api/scrape-stream
app.post('/api/scrape-stream', async (req, res) => {
  const { url, pages } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL required' });

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  const heartbeat = setInterval(() => {
    try { res.write(`event: ping\ndata: {}\n\n`); } catch (e) { }
  }, 15000);

  // progress callback
  function progressCb(obj) {
    sseSend(res, 'progress', obj);
  }

  try {
    const { items } = await scrape(url, Number(pages || 1), progressCb);
    const safeItems = Array.isArray(items) ? items : [];
    const createdAt = new Date().toISOString();
    const csvFilename = `run_${Date.now()}.csv`;
    const csvPath = path.join(dataDir, csvFilename);

    db.run(`INSERT INTO runs (created_at, url, pages, item_count, csv_path) VALUES (?,?,?,?,?)`,
      [createdAt, url, pages || 1, safeItems.length, csvPath],
      function (err) {
        if (err) {
          sseSend(res, 'error', { message: 'DB insert failed' });
          clearInterval(heartbeat);
          try { res.end(); } catch (e) { }
          return;
        }
        const runId = this.lastID;

        // save CSV file
        try {
          const csv = parse(safeItems.map(it => ({ title: it.title, price: it.price, availability: it.availability, category: it.category })));
          fs.writeFileSync(csvPath, csv, 'utf8');
        } catch (e) { /* ignore */ }

        // bulk insert items
        const stmt = db.prepare(`INSERT INTO items (run_id, title, price, price_num, availability, category, formatted_html) VALUES (?,?,?,?,?,?,?)`);
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          for (const it of safeItems) {
            stmt.run(runId, it.title || '', it.price || null, it.price_num || null, it.availability || null, it.category || null, it.formatted_html || null);
          }
          db.run('COMMIT');
        });
        stmt.finalize();

        sseSend(res, 'done', { runId, csvPath, itemCount: safeItems.length, message: 'Scrape complete' });
        clearInterval(heartbeat);
        try { res.end(); } catch (e) { }
      });
  } catch (e) {
    sseSend(res, 'error', { message: e.message || 'Scrape failed' });
    clearInterval(heartbeat);
    try { res.end(); } catch (e) { }
  }
});

// GET /api/history
app.get('/api/history', (req, res) => {
  db.all(`SELECT * FROM runs ORDER BY id DESC LIMIT 50`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    const runs = rows.map(r => ({ ...r, time_ago: formatDistanceToNow(new Date(r.created_at), { addSuffix: true }) }));
    res.json({ runs });
  });
});

// GET /api/run/:id (pagination + filters + sorting)
app.get('/api/run/:id', (req, res) => {
  const id = Number(req.params.id);
  const page = Number(req.query.page || 1);
  const per_page = Number(req.query.per_page || 25);
  const offset = (page - 1) * per_page;

  let where = 'WHERE run_id = ?';
  const params = [id];

  if (req.query.search) {
    where += ' AND title LIKE ?';
    params.push(`%${req.query.search}%`);
  }
  if (req.query.price_min) {
    where += ' AND price_num >= ?';
    params.push(req.query.price_min);
  }
  if (req.query.price_max) {
    where += ' AND price_num <= ?';
    params.push(req.query.price_max);
  }
  if (req.query.availability) {
    where += ' AND availability LIKE ?';
    params.push(`%${req.query.availability}%`);
  }

  // Sorting support
  const allowedSort = ['title', 'price_num', 'availability', 'category'];
  const sortBy = allowedSort.includes(req.query.sortBy) ? req.query.sortBy : 'id';
  const sortOrder = req.query.sortOrder && req.query.sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const sql = `SELECT * FROM items ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;

  db.all(sql, [...params, per_page, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    db.get(`SELECT COUNT(*) as count FROM items ${where}`, params, (err2, countRow) => {
      if (err2) return res.status(500).json({ error: 'DB error' });
      res.json({ items: rows, total: countRow.count, page });
    });
  });
});

// GET /api/export/:id?format=
app.get('/api/export/:id', (req, res) => {
  const id = Number(req.params.id);
  const fmt = (req.query.format || 'csv').toLowerCase();
  db.all(`SELECT * FROM items WHERE run_id = ?`, [id], async (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'No items' });

    try {
      if (fmt === 'csv') {
        const csv = parse(rows.map(r => ({ title: r.title, price: r.price, availability: r.availability, category: r.category })));
        res.header('Content-Type', 'text/csv');
        res.attachment(`run_${id}.csv`);
        return res.send(csv);
      }
      if (fmt === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Items');
        sheet.addRow(['id', 'run_id', 'title', 'price', 'price_num', 'availability', 'category']);
        rows.forEach(r => sheet.addRow([r.id, r.run_id, r.title, r.price, r.price_num, r.availability, r.category]));
        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment(`run_${id}.xlsx`);
        await workbook.xlsx.write(res);
        return res.end();
      }
      if (fmt === 'pdf') {
        res.header('Content-Type', 'application/pdf');
        res.attachment(`run_${id}.pdf`);
        const doc = new PDFDocument({ margin: 30 });
        doc.pipe(res);
        rows.forEach(r => {
          doc.fontSize(10).text(`${r.title} | ${r.price || ''} | ${r.availability || ''}`);
          doc.moveDown(0.4);
        });
        doc.end();
        return;
      }
      return res.status(400).json({ error: 'Unsupported format' });
    } catch (e) {
      return res.status(500).json({ error: 'Export failed' });
    }
  });
});

// DELETE /api/delete-runs
app.delete('/api/delete-runs', (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(x => Number(x)).filter(Boolean) : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No ids' });
  const placeholders = ids.map(() => '?').join(',');
  db.all(`SELECT id,csv_path FROM runs WHERE id IN (${placeholders})`, ids, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    rows.forEach(r => {
      if (r.csv_path && fs.existsSync(r.csv_path)) try { fs.unlinkSync(r.csv_path); } catch (e) { }
      db.run(`DELETE FROM items WHERE run_id = ?`, [r.id]);
      db.run(`DELETE FROM runs WHERE id = ?`, [r.id]);
    });
    res.json({ message: `Deleted ${rows.length} runs` });
  });
});

// serve index
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, 'index.html');
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'taskflow-db.json');

function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: parsed && typeof parsed.users === 'object' ? parsed.users : {},
      states: parsed && typeof parsed.states === 'object' ? parsed.states : {}
    };
  } catch {
    return { users: {}, states: {} };
  }
}

function writeDb(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(text);
}

function normalizeUser(value) {
  return String(value || '').trim().toLowerCase();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(ROOT, safePath.replace(/^\/+/, ''));

  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    if (fs.existsSync(INDEX_FILE)) {
      const html = fs.readFileSync(INDEX_FILE, 'utf8');
      sendText(res, 200, html, 'text/html; charset=utf-8');
      return;
    }
    sendText(res, 404, 'Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon'
  };

  const content = fs.readFileSync(filePath);
  sendText(res, 200, content, map[ext] || 'application/octet-stream');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/user-exists') {
      const user = normalizeUser(url.searchParams.get('user'));
      const db = readDb();
      sendJson(res, 200, { exists: !!db.users[user] });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/register') {
      const body = await readJsonBody(req);
      const user = normalizeUser(body.user);
      const hash = String(body.hash || '');

      if (user.length < 2 || hash.length < 1) {
        sendJson(res, 400, { error: 'Invalid user payload.' });
        return;
      }

      const db = readDb();
      if (db.users[user]) {
        sendJson(res, 409, { error: 'Username already taken.' });
        return;
      }

      db.users[user] = { hash };
      writeDb(db);
      sendJson(res, 201, { ok: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/login') {
      const body = await readJsonBody(req);
      const user = normalizeUser(body.user);
      const hash = String(body.hash || '');
      const db = readDb();

      if (!db.users[user]) {
        sendJson(res, 404, { error: 'User not found.' });
        return;
      }

      if (db.users[user].hash !== hash) {
        sendJson(res, 401, { error: 'Incorrect password.' });
        return;
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname.startsWith('/api/state/')) {
      const user = normalizeUser(decodeURIComponent(pathname.slice('/api/state/'.length)));
      if (!user) {
        sendJson(res, 400, { error: 'Missing user.' });
        return;
      }

      if (req.method === 'GET') {
        const db = readDb();
        sendJson(res, 200, { state: db.states[user] || null });
        return;
      }

      if (req.method === 'PUT') {
        const body = await readJsonBody(req);
        if (!body || typeof body.state !== 'object' || Array.isArray(body.state)) {
          sendJson(res, 400, { error: 'Invalid state payload.' });
          return;
        }

        const db = readDb();
        db.states[user] = body.state;
        writeDb(db);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Internal server error.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TaskFlow server running at http://${HOST}:${PORT}`);
});

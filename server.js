const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');

const KULLANICI = process.env.TIKTOK_USER;
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.EULER_API_KEY || undefined;
const ADMIN_KEY = process.env.ADMIN_KEY;

let tt = null;
let durum = 'Bagli degil';
let istenen = false;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const yetkili = ADMIN_KEY && u.searchParams.get('key') === ADMIN_KEY;
  const k = encodeURIComponent(u.searchParams.get('key') || '');

  if (u.pathname === '/admin' || u.pathname === '/baglan' || u.pathname === '/kes') {
    if (!yetkili) { res.writeHead(403); return res.end('yetkisiz'); }
    if (u.pathname === '/baglan') baglan();
    if (u.pathname === '/kes') kes();
    if (u.pathname !== '/admin') {
      res.writeHead(302, { Location: '/admin?key=' + k });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:sans-serif;background:#111;color:#fff;padding:24px;text-align:center">
<h2>Kopru: ${KULLANICI || '(TIKTOK_USER yok)'}</h2>
<p style="font-size:20px">Durum: <b>${durum}</b></p>
<p><a href="/baglan?key=${k}" style="display:block;padding:18px;margin:12px;background:#1a9b4b;color:#fff;border-radius:12px;font-size:22px;text-decoration:none">Baglan</a>
<a href="/kes?key=${k}" style="display:block;padding:18px;margin:12px;background:#b33;color:#fff;border-radius:12px;font-size:22px;text-decoration:none">Kes</a>
<a href="/admin?key=${k}" style="display:block;padding:14px;margin:12px;background:#333;color:#fff;border-radius:12px;text-decoration:none">Durumu yenile</a></p>`);
  }

  const mm = u.pathname.match(/^\/(muzik\d{1,2}\.mp3)$/);
  if (mm) {
    const f = path.join(__dirname, mm[1]);
    return fs.stat(f, (err, st) => {
      if (err) { res.writeHead(404); return res.end('yok'); }
      const rg = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (rg) {
        const s = rg[1] ? parseInt(rg[1], 10) : 0;
        let e = rg[2] ? parseInt(rg[2], 10) : st.size - 1;
        if (e >= st.size) e = st.size - 1;
        if (isNaN(s) || s > e) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
        res.writeHead(206, { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes ' + s + '-' + e + '/' + st.size, 'Content-Length': e - s + 1 });
        return fs.createReadStream(f, { start: s, end: e }).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
      fs.createReadStream(f).pipe(res);
    });
  }

  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) { res.writeHead(404); return res.end('index.html yok'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const yolla = (o) => wss.clients.forEach(c => c.readyState === 1 && c.send(JSON.stringify(o)));

function kes() {
  istenen = false;
  if (tt) { try { tt.disconnect(); } catch (e) {} tt = null; }
  durum = 'Bagli degil';
}

function baglan() {
  if (tt) return;
  istenen = true;
  durum = 'Baglaniyor...';
  const c = new TikTokLiveConnection(KULLANICI, { signApiKey: API_KEY });
  tt = c;

  c.on(WebcastEvent.GIFT, (d) => {
    if (d.giftType === 1 && !d.repeatEnd) return;
    console.log('HEDIYE:', d.giftName, '| id:', d.giftId, '| adet:', d.repeatCount);
    yolla({
      tip: 'hediye',
      kullanici: d.user.uniqueId,
      hediye: d.giftName,
      id: d.giftId,
      adet: d.repeatCount || 1,
      elmas: d.diamondCount * (d.repeatCount || 1)
    });
  });

  c.on(WebcastEvent.DISCONNECTED, () => {
    if (tt !== c) return;
    tt = null;
    durum = 'Koptu';
    if (istenen) setTimeout(() => { if (istenen && !tt) baglan(); }, 30000);
  });

  c.connect()
    .then(() => { durum = 'Bagli (yayin dinleniyor)'; console.log('Yayina baglandi'); })
    .catch((e) => {
      if (tt === c) tt = null;
      istenen = false;
      durum = 'Hata: ' + String((e && e.message) || e).split('\n')[0];
      console.log('Baglanamadi:', durum);
    });
}

server.listen(PORT);

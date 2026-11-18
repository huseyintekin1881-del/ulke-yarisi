const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');

const KULLANICI = process.env.TIKTOK_USER;
const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) { res.writeHead(404); return res.end('index.html yok'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const yolla = (o) => wss.clients.forEach(c => c.readyState === 1 && c.send(JSON.stringify(o)));

function baglan() {
  const tt = new TikTokLiveConnection(KULLANICI);
  tt.connect()
    .then(() => console.log('Yayina baglandi'))
    .catch((e) => {
      console.log('Baglanamadi, 15sn sonra tekrar:', e.message);
      setTimeout(baglan, 15000);
    });

  tt.on(WebcastEvent.GIFT, (d) => {
    if (d.giftType === 1 && !d.repeatEnd) return;
    console.log('HEDIYE:', d.giftName, '| id:', d.giftId, '| adet:', d.repeatCount);
    yolla({
      tip: 'hediye',
      kullanici: d.user.uniqueId,
      hediye: d.giftName,
      adet: d.repeatCount || 1,
      elmas: d.diamondCount * (d.repeatCount || 1)
    });
  });

  tt.on(WebcastEvent.DISCONNECTED, () => setTimeout(baglan, 15000));
}

baglan();
server.listen(PORT);

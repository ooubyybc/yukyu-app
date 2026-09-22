/* 有給管理 - Service Worker
   ---------------------------------------------------------------------------
   方針：アプリ本体（HTML/JS/JSON）は「ネットワーク優先」。
         オンラインなら必ず最新を取りに行き、圏外のときだけキャッシュを使う。
         アイコンなど変わらないものは「キャッシュ優先」。
   これで、更新したのに古い画面が残り続ける問題が起きにくくなる。
   ファイルを更新したら VERSION の数字を 1 つ上げてください。
   --------------------------------------------------------------------------- */
const VERSION = 'v11';
const CACHE = 'yukyu-' + VERSION;

const SHELL = ['./', './index.html', './core.js', './ui.js', './manifest.json'];
const ICONS = [
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll([...SHELL, ...ICONS]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** 常に最新を取りに行き、失敗したらキャッシュ */
async function networkFirst(req) {
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const idx = await caches.match('./index.html');
      if (idx) return idx;
    }
    throw err;
  }
}

/** 先にキャッシュ、無ければ取得 */
async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isShell = req.mode === 'navigate' || /\.(html|js|css|json)$/i.test(url.pathname);
  e.respondWith(isShell ? networkFirst(req) : cacheFirst(req));
});

/* 画面から「今すぐ更新して」と言われたとき */
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

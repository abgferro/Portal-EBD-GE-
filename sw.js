/* ═══════════════════════════════════════
   EBD ADGE — Service Worker v2.0
   Estratégias: static cache-first, dynamic stale-while-revalidate
═══════════════════════════════════════ */

const VERSION = 'v2.0';
const CACHE_STATIC  = `ebd-static-${VERSION}`;
const CACHE_DYNAMIC = `ebd-dynamic-${VERSION}`;
const CACHE_IMAGES  = `ebd-images-${VERSION}`;

// Assets essenciais — cache na instalação
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/logo-adge.jpg',
  '/capa-revista-2t2026.jpg',
];

// Assets de lições do trimestre atual
const LESSON_ASSETS = [
  '/2026-t2/index.html',
  '/2026-t2/licao-01.html',
  '/2026-t2/licao-02.html',
  '/2026-t2/licao-03.html',
  '/2026-t2/licao-04.html',
  '/2026-t2/licao-05.html',
  '/2026-t2/licao-06.html',
  '/2026-t2/licao-07.html',
  '/2026-t2/licao-08.html',
];

// ── INSTALAR ──
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(CACHE_STATIC);
      // Adiciona assets um a um para não falhar tudo se um der erro
      await Promise.allSettled(
        [...STATIC_ASSETS, ...LESSON_ASSETS].map(url =>
          staticCache.add(url).catch(() => {})
        )
      );
    })()
  );
  self.skipWaiting();
});

// ── ATIVAR — limpar caches antigos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const validCaches = [CACHE_STATIC, CACHE_DYNAMIC, CACHE_IMAGES];
      const allKeys = await caches.keys();
      await Promise.all(
        allKeys
          .filter(key => !validCaches.includes(key))
          .map(key => caches.delete(key))
      );
    })()
  );
  self.clients.claim();
});

// ── FETCH — estratégias por tipo de recurso ──
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Externo (fontes Google, etc.) — network-first sem bloquear
  if(url.origin !== self.location.origin) {
    event.respondWith(networkFirst(event.request, CACHE_DYNAMIC));
    return;
  }

  // Imagens — cache-first com fallback
  if(/\.(jpg|jpeg|png|webp|avif|gif|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request, CACHE_IMAGES));
    return;
  }

  // HTML de páginas — stale-while-revalidate
  if(event.request.destination === 'document' || /\.html$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_STATIC));
    return;
  }

  // CSS, JS e outros assets estáticos — cache-first
  event.respondWith(cacheFirst(event.request, CACHE_STATIC));
});

/* ── ESTRATÉGIAS ── */

// Cache-first: retorna do cache, busca na rede se não tiver
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if(cached) return cached;

  try {
    const response = await fetch(request);
    if(response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match('/offline.html') || new Response('Offline', {status: 503});
  }
}

// Network-first: tenta rede, usa cache se falhar
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if(response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', {status: 503});
  }
}

// Stale-while-revalidate: retorna cache imediatamente, atualiza em background
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if(response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || fetchPromise || caches.match('/offline.html');
}

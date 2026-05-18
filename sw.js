/* ═══════════════════════════════════════
   EBD ADGE — Service Worker v3.0
   + Push Notifications (OneSignal-ready)
   + Progresso do aluno (IndexedDB via postMessage)
   Estratégias: static cache-first, dynamic stale-while-revalidate
═══════════════════════════════════════ */

const VERSION      = 'v3.0';
const CACHE_STATIC  = `ebd-static-${VERSION}`;
const CACHE_DYNAMIC = `ebd-dynamic-${VERSION}`;
const CACHE_IMAGES  = `ebd-images-${VERSION}`;

/* ── HORÁRIOS DAS AULAS ──
   Oração matinal: 07:30–08:30
   Aula EBD:       08:30–10:30
   Notificações:
     - 07:15 → "Em 15 minutos começa a oração matinal"
     - 08:15 → "Em 15 minutos começa a EBD"
     - 08:30 → "A EBD está começando agora!"
*/

// Assets essenciais — cache na instalação
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/logo-adge.jpg',
  '/capa-revista-2t2026.jpg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
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

/* ═══════════════════════════════════════
   INSTALAR
═══════════════════════════════════════ */
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(CACHE_STATIC);
      await Promise.allSettled(
        [...STATIC_ASSETS, ...LESSON_ASSETS].map(url =>
          staticCache.add(url).catch(() => {})
        )
      );
    })()
  );
  self.skipWaiting();
});

/* ═══════════════════════════════════════
   ATIVAR — limpar caches antigos
═══════════════════════════════════════ */
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

/* ═══════════════════════════════════════
   FETCH — estratégias por tipo de recurso
═══════════════════════════════════════ */
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Externo (fontes Google, OneSignal etc.) — network-first
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

/* ═══════════════════════════════════════
   PUSH NOTIFICATIONS
   ─────────────────────────────────────
   Tipos de notificação (campo "type" no payload):
     "prayer_soon"   → Oração matinal em 15 min (07:15)
     "class_soon"    → EBD em 15 minutos (08:15)
     "class_start"   → EBD começando agora! (08:30)
     "new_lesson"    → Nova lição disponível
═══════════════════════════════════════ */
self.addEventListener('push', event => {
  // Payload padrão caso o servidor não envie dados
  let data = {
    type: 'generic',
    title: 'EBD ADGE',
    body: 'Você tem uma atualização da Escola Bíblica.',
    url: '/',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-72.png',
  };

  if(event.data) {
    try { Object.assign(data, event.data.json()); } catch(e) {}
  }

  // Personalizar por tipo
  const notifOptions = buildNotification(data);

  event.waitUntil(
    self.registration.showNotification(notifOptions.title, notifOptions.options)
  );
});

function buildNotification(data) {
  const base = {
    icon: data.icon || '/assets/icons/icon-192.png',
    badge: data.badge || '/assets/icons/icon-72.png',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    data: { url: data.url || '/' },
  };

  switch(data.type) {

    case 'prayer_soon':
      return {
        title: '🙏 Oração Matinal em 15 minutos',
        options: {
          ...base,
          body: 'A oração matinal começa às 07:30. Venha participar antes da EBD!',
          tag: 'prayer-soon',
          requireInteraction: false,
          actions: [
            { action: 'ok', title: '✓ Ciente' }
          ]
        }
      };

    case 'class_soon':
      return {
        title: '📖 EBD começa em 15 minutos',
        options: {
          ...base,
          body: 'Prepare seu coração! A Escola Bíblica começa às 08:30.',
          tag: 'class-soon',
          requireInteraction: false,
          actions: [
            { action: 'open', title: '📚 Abrir lição' },
            { action: 'ok',   title: '✓ Ciente' }
          ]
        }
      };

    case 'class_start':
      return {
        title: '🎉 A EBD está começando agora!',
        options: {
          ...base,
          body: `${data.lessonTitle || 'A aula de hoje'} — venha participar! Deus abençoe seu estudo.`,
          tag: 'class-start',
          requireInteraction: true,
          vibrate: [300, 150, 300, 150, 300],
          actions: [
            { action: 'open', title: '📖 Abrir lição' },
            { action: 'ok',   title: '✓ Vou lá!' }
          ]
        }
      };

    case 'new_lesson':
      return {
        title: `🔓 Nova lição disponível!`,
        options: {
          ...base,
          body: `${data.lessonNum ? 'Lição ' + data.lessonNum + ': ' : ''}${data.lessonTitle || 'Novo conteúdo disponível na EBD.'}`,
          tag: 'new-lesson',
          requireInteraction: true,
          vibrate: [400, 200, 400],
          actions: [
            { action: 'open', title: '📖 Estudar agora' },
            { action: 'ok',   title: '✓ Ver depois' }
          ]
        }
      };

    default:
      return {
        title: data.title || 'EBD ADGE',
        options: {
          ...base,
          body: data.body || 'Você tem uma atualização.',
          tag: 'generic',
        }
      };
  }
}

/* ═══════════════════════════════════════
   CLIQUE NA NOTIFICAÇÃO
═══════════════════════════════════════ */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const action = event.action;
  const notifData = event.notification.data || {};
  const targetUrl = (action === 'open' && notifData.url) ? notifData.url : (notifData.url || '/');

  if(action === 'ok') return; // usuário apenas fechou

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Se já tem janela aberta, foca nela
      for(const client of clientList) {
        if(client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Senão abre nova janela
      if(clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

/* ═══════════════════════════════════════
   MENSAGENS DO CLIENTE
   (comunicação bidirecional: página → SW)
═══════════════════════════════════════ */
self.addEventListener('message', event => {
  if(!event.data) return;

  switch(event.data.type) {
    // Página pede para o SW checar nova versão
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    // Página confirma que lição foi lida (para progresso)
    case 'LESSON_READ':
      // Não armazenamos aqui — o progresso fica no localStorage da página.
      // Mas podemos repassar para outros clientes (ex.: outra aba aberta).
      clients.matchAll().then(cls => {
        cls.forEach(c => {
          if(c !== event.source) c.postMessage({ type: 'LESSON_READ', lessonId: event.data.lessonId });
        });
      });
      break;
  }
});

/* ═══════════════════════════════════════
   ESTRATÉGIAS DE CACHE
═══════════════════════════════════════ */

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

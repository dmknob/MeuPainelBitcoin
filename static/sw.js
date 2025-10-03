const CACHE_NAME = 'bitpanel-cache-v2'; // <--- VERSÃO DO CACHE ATUALIZADA!
// Lista de arquivos que compõem a "casca" do aplicativo (App Shell)
const urlsToCache = [
    '/',
    '/dca',
    '/style.css',
    '/js/common.js',
    '/js/dashboard.js',
    '/js/dca.js',
    '/images/icon-192x192.png',
    '/images/icon-512x512.png'
    // Adicione outros assets estáticos importantes aqui, se houver
];

// Evento de Instalação: Salva o App Shell no cache
self.addEventListener('install', event => {
    console.log('Service Worker: Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Cache aberto e App Shell adicionado');
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('Service Worker: Falha na instalação ou no cache.addAll:', error);
            })
    );
});

// Evento de Ativação: Limpa caches antigos
self.addEventListener('activate', event => {
    console.log('Service Worker: Ativando...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Removendo cache antigo', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Garante que o Service Worker assume o controle da página imediatamente
            // Isso pode ser útil para ver as atualizações sem um hard refresh
            return self.clients.claim();
        })
    );
});


// Evento de Fetch: Intercepta as requisições para aplicar estratégias de cache
self.addEventListener('fetch', event => {
    // 1. Estratégia para Requisições de API (Network Only, sem cache no SW, apenas frontend)
    if (event.request.url.includes('/api/')) {
        event.respondWith(
            fetch(event.request).catch(error => {
                console.error('Service Worker: Falha ao buscar API (offline ou erro de rede):', error);
                // Não há fallback no SW aqui, a lógica de erro/offline deve ser no frontend
                // Ou você pode retornar uma resposta de erro genérica:
                // return new Response(JSON.stringify({ error: 'Offline' }), { headers: { 'Content-Type': 'application/json' }, status: 503 });
            })
        );
        return;
    }

    // 2. Estratégia para Assets Estáticos (CSS, JS, Imagens, HTML do App Shell): Stale-While-Revalidate
    // Isso garante que o conteúdo seja servido rapidamente do cache e atualizado em segundo plano.
    // Usamos 'some' para verificar se a URL da requisição corresponde a algum item em urlsToCache.
    // O replace(/^\//, '') remove a barra inicial para uma comparação mais flexível.
    const isAppShellAsset = urlsToCache.some(url => event.request.url.includes(url.replace(/^\//, '')) || event.request.url === self.location.origin + url);

    if (isAppShellAsset) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(response => {
                    // Tenta buscar da rede em segundo plano para atualizar o cache
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        cache.put(event.request, networkResponse.clone()); // Atualiza o cache
                        return networkResponse;
                    }).catch(error => {
                        console.warn('Service Worker: Falha ao revalidar asset da rede:', event.request.url, error);
                        // Se a rede falhar na revalidação, continua servindo do cache se houver
                    });
                    
                    // Retorna a versão do cache imediatamente, ou espera pela rede se não houver cache
                    return response || fetchPromise;
                });
            })
        );
        return;
    }

    // 3. Estratégia padrão para outros recursos (ex: imagens externas não cacheáveis no App Shell): Network First
    // Tenta ir para a rede primeiro. Se falhar, tenta o cache.
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
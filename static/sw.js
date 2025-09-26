const CACHE_NAME = 'bitpanel-cache-v1';
// Lista de arquivos que compõem a "casca" do aplicativo
const urlsToCache = [
    '/',
    '/dca',
    '/style.css',
    '/js/common.js',
    '/js/dashboard.js',
    '/js/dca.js',
    '/images/icon-192x192.png',
    '/images/icon-512x512.png'
];

// Evento de Instalação: Salva o App Shell no cache
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache aberto');
                return cache.addAll(urlsToCache);
            })
    );
});

// Evento de Fetch: Intercepta as requisições
self.addEventListener('fetch', event => {
    // Para a API de dados, sempre tentamos a rede primeiro.
    if (event.request.url.includes('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                // Se a rede falhar, não faz nada (o frontend usará o localStorage)
                // Poderíamos retornar uma resposta de erro offline aqui se quiséssemos.
            })
        );
        return;
    }

    // Para todos os outros arquivos (HTML, CSS, JS, imagens), usamos a estratégia "Cache First".
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Se encontrarmos no cache, retornamos.
                if (response) {
                    return response;
                }
                // Senão, buscamos na rede.
                return fetch(event.request);
            })
    );
});
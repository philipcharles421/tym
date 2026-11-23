const CACHE_NAME = 'tym-v6';
const PRECACHE_URLS = [
    './landing.html',
    './login.html',
    './signup.html',
    './dashboard.html',
    './inbox.html',
    './index.html',
    './style.css',
    './inbox.css',
    './dashboard-style.css',
    './signup-style.css',
    './login-style.css',
    './landing-style.css',
    './utils.js',
    './script.js',
    './dashboard.js',
    './inbox.js',
    './signup.js',
    './login.js',
    './landing.js',
    './assets/tym-logo.png',
    './assets/default-avatar.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('supabase.co')) return;

    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
});

self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'TYM – New Message';
    const options = {
        body: data.body || 'You received a new anonymous message!',
        icon: './assets/tym-logo.png',
        badge: './assets/tym-logo.png',
        tag: 'tym-new-message',
        renotify: true
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                for (const client of windowClients) {
                    if (client.url.includes('inbox.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                return clients.openWindow('./inbox.html');
            })
    );
});

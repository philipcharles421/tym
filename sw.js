const CACHE_NAME = 'tym-v11';
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
    './assets/icon-512.png',
    './assets/icon-192.png',
    './assets/apple-touch-icon.png',
    './assets/favicon-32.png',
    './assets/favicon-16.png',
    './assets/default-avatar.svg',
    './assets/avatars/ghost.svg',
    './assets/avatars/fox.svg',
    './assets/avatars/cat.svg',
    './assets/avatars/panda.svg',
    './assets/avatars/robot.svg',
    './assets/avatars/owl.svg',
    './assets/avatars/bear.svg',
    './assets/avatars/alien.svg'
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
        icon: './assets/icon-192.png',
        badge: './assets/icon-192.png',
        tag: 'tym-new-message',
        renotify: true
    };

    const tasks = [self.registration.showNotification(title, options)];

    if ('setAppBadge' in navigator && typeof data.badgeCount === 'number') {
        tasks.push(navigator.setAppBadge(data.badgeCount).catch(() => {}));
    }

    event.waitUntil(Promise.all(tasks));
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

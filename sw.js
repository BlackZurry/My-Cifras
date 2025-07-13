self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('fetch', () => {
  // Aqui pode implementar cache, etc
});

// A simple service worker to satisfy PWA installation requirements
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    // We leave this empty to act as a pass-through, so it always fetches fresh data 
    // but still allows the app to be "installed" on iOS/Android.
});
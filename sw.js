const CACHE = "so-kartini-v2"; // naikkan angka tiap deploy yang mengubah file
const ASSETS = [
  "./",
  "index.html",
  "admin.html",
  "master.json",
  "manifest.json",
  "assets/css/app.css",
  "assets/js/convert.js",
  "assets/js/csv.js",
  "assets/js/master.js",
  "assets/js/merge.js",
  "assets/js/store.js",
  "assets/js/employee.js",
  "assets/js/admin.js",
  "assets/vendor/xlsx.full.min.js",
  "assets/icon-192.png",
  "assets/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith("master.json")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request)));
  }
});

const CACHE = 'utah-v4'

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // allSettled so missing files don't break install
      Promise.allSettled(
        ['/', '/utah_v4.html', '/index.html', '/guide.html'].map(u => c.add(u))
      )
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return
  if (e.request.method !== 'GET') return
  // Only cache HTML pages — leave API/JSON calls alone
  const isHtml = e.request.headers.get('accept')?.includes('text/html')
    || url.pathname === '/'
    || url.pathname.endsWith('.html')
  if (!isHtml) return
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone()
      caches.open(CACHE).then(c => c.put(e.request, clone))
      return res
    }))
  )
})

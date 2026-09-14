// Service worker des notifications. Il ne met rien en cache : l'application reste en ligne.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_) {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'LeadControl', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      tag: data.tag,
      data: { url: data.url || '/app/inbox' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/app/inbox', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) return open.focus().then((w) => (w ? w.navigate(url) : self.clients.openWindow(url)))
      return self.clients.openWindow(url)
    }),
  )
})

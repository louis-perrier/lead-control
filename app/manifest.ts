import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LeadControl',
    short_name: 'LeadControl',
    description: 'Vos conversations Instagram et les notifications de votre assistant.',
    start_url: '/app/inbox',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f8fc',
    theme_color: '#ffffff',
    lang: 'fr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

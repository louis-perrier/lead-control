// Notifications sur les téléphones abonnés (Web Push). Appelée par le déclencheur de la table
// notifications, ou par l'utilisateur pour un test depuis Réglages. GET /public-key renvoie la
// clé publique VAPID dont le navigateur a besoin pour s'abonner.
import * as webpush from 'jsr:@negrel/webpush@0.5.0'
import { admin, getUser, handleOptions, isCronCall, json, logEvent } from '../_shared/core.ts'

const VAPID_KEYS = Deno.env.get('VAPID_KEYS') ?? ''
const CONTACT = 'https://leadcontrol.fr'
// Seuls les services de push des navigateurs sont appelés, jamais une adresse arbitraire.
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|notify\.windows\.com)$/

type Payload = { title: string; body: string; url: string; tag: string }

let serverPromise: Promise<{ server: webpush.ApplicationServer; publicKey: string }> | null = null

function appServer() {
  serverPromise ??= (async () => {
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(VAPID_KEYS), { extractable: false })
    const server = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys })
    return { server, publicKey: await webpush.exportApplicationServerKey(vapidKeys) }
  })()
  return serverPromise
}

async function sendToUser(userId: string, payload: Payload) {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
  const { server } = await appServer()
  let delivered = 0
  for (const sub of subs ?? []) {
    let host = ''
    try {
      host = new URL(sub.endpoint).hostname
    } catch (_) {
      // adresse illisible, supprimée juste en dessous
    }
    if (!PUSH_HOSTS.test(host)) {
      await admin.from('push_subscriptions').delete().eq('id', sub.id)
      continue
    }
    try {
      await server
        .subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } })
        .pushTextMessage(JSON.stringify(payload), { ttl: 24 * 3600, urgency: webpush.Urgency.High })
      delivered += 1
      await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', sub.id)
    } catch (e) {
      // 404 ou 410 : l'application a été désinstallée ou la permission retirée.
      if (e instanceof webpush.PushMessageError && [404, 410].includes(e.response.status)) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        await logEvent('warn', 'notifications-push', `envoi échoué (${host}): ${String(e).slice(0, 200)}`, { user_id: userId })
      }
    }
  }
  return delivered
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  if (!VAPID_KEYS) return json(req, { error: 'push_not_configured' }, 503)
  const url = new URL(req.url)

  if (req.method === 'GET' && url.pathname.endsWith('/public-key')) {
    const { publicKey } = await appServer()
    return json(req, { publicKey })
  }
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  let body: { notification_id?: number; test?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_body' }, 400)
  }

  if (body.test) {
    const user = await getUser(req)
    if (!user) return json(req, { error: 'Unauthorized' }, 401)
    const delivered = await sendToUser(user.id, {
      title: 'LeadControl',
      body: 'Les notifications fonctionnent sur cet appareil.',
      url: '/app/settings',
      tag: 'test',
    })
    return json(req, { delivered })
  }

  if (!(await isCronCall(req))) return json(req, { error: 'Unauthorized' }, 401)
  const { data: notification } = await admin
    .from('notifications')
    .select('id, user_id, conversation_id, kind, body, read_at, conversations(contact_name, contact_handle)')
    .eq('id', body.notification_id ?? 0)
    .maybeSingle()
  if (!notification || notification.read_at) return json(req, { delivered: 0 })

  const contact = notification.conversations as unknown as { contact_name: string | null; contact_handle: string | null } | null
  const who = contact?.contact_name || (contact?.contact_handle ? `@${contact.contact_handle}` : 'Un prospect')
  const delivered = await sendToUser(notification.user_id, {
    title: notification.kind === 'needs_you' ? `${who} a besoin de vous` : 'Assistant bloqué',
    body: notification.body,
    url: notification.conversation_id ? `/app/inbox?c=${notification.conversation_id}` : '/app/inbox',
    tag: `notification-${notification.id}`,
  })
  return json(req, { delivered })
})

// Rafraîchit chaque nuit les tokens Instagram longue durée qui expirent
// sous 10 jours. Un échec marque le compte expired et prévient le client.
import { admin, isCronCall, json, logEvent } from '../_shared/core.ts'
import { AVATAR_REFRESH_MS, refreshContactAvatar } from '../_shared/avatars.ts'
import { getChannelToken, markChannelExpired } from '../_shared/instagram.ts'

const AVATAR_BATCH = 50
const AVATAR_PARALLEL = 5

// Remplit les photos des conversations existantes et rafraîchit celles des prospects qui
// n'ont pas réécrit depuis une semaine. Borné pour tenir dans la durée du cron.
async function refreshStaleAvatars() {
  const staleBefore = new Date(Date.now() - AVATAR_REFRESH_MS).toISOString()
  const activeSince = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { data: accounts } = await admin.from('channel_accounts').select('id').eq('status', 'connected')
  const connected = (accounts ?? []).map((a) => a.id)
  if (connected.length === 0) return 0
  const { data: stale } = await admin
    .from('conversations')
    .select('id, user_id, channel_account_id, contact_external_id')
    .in('channel_account_id', connected)
    .not('contact_external_id', 'is', null)
    .gte('last_message_at', activeSince)
    .or(`contact_avatar_checked_at.is.null,contact_avatar_checked_at.lt.${staleBefore}`)
    .limit(AVATAR_BATCH)
  const queue = [...(stale ?? [])]
  const tokens = new Map<string, Promise<string | null>>()
  const tokenFor = (id: string) => {
    if (!tokens.has(id)) tokens.set(id, getChannelToken(id).catch(() => null))
    return tokens.get(id)!
  }
  await Promise.all(
    Array.from({ length: AVATAR_PARALLEL }, async () => {
      while (queue.length) {
        const conv = queue.shift()!
        const token = await tokenFor(conv.channel_account_id)
        if (token) await refreshContactAvatar(conv, token)
      }
    }),
  )
  return stale?.length ?? 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!(await isCronCall(req))) return new Response('unauthorized', { status: 401 })

  const { data: accounts } = await admin
    .from('channel_accounts')
    .select('id, external_id, token_expires_at, status')
    .eq('provider', 'instagram')
    .in('status', ['connected', 'expired'])
  let refreshed = 0
  let failed = 0

  for (const account of accounts ?? []) {
    const { data: tokenRow } = await admin
      .schema('secrets')
      .from('channel_tokens')
      .select('long_lived_token')
      .eq('channel_account_id', account.id)
      .maybeSingle()
    const token = tokenRow?.long_lived_token
    if (!token) {
      failed += 1
      continue
    }
    const expiresSoon =
      !account.token_expires_at ||
      Date.parse(account.token_expires_at) - Date.now() < 10 * 24 * 3600 * 1000
    if (account.status === 'connected' && !expiresSoon) continue
    try {
      const res = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
      )
      const payload = await res.json()
      if (!res.ok || !payload.access_token) throw new Error(JSON.stringify(payload).slice(0, 200))
      const expiresAt = new Date(Date.now() + (payload.expires_in ?? 0) * 1000).toISOString()
      await admin
        .schema('secrets')
        .from('channel_tokens')
        .update({ long_lived_token: payload.access_token, expires_at: expiresAt, updated_at: new Date().toISOString() })
        .eq('channel_account_id', account.id)
      await admin
        .from('channel_accounts')
        .update({ status: 'connected', token_expires_at: expiresAt, last_refresh_at: new Date().toISOString(), last_error: null })
        .eq('id', account.id)
      refreshed += 1
    } catch (e) {
      failed += 1
      await markChannelExpired(account.id, `refresh: ${String(e).slice(0, 160)}`)
    }
  }

  if (failed > 0) {
    await logEvent('warn', 'instagram-token-refresh', `${failed} compte(s) Instagram non rafraîchi(s)`)
  }
  const avatars = await refreshStaleAvatars()
  return json(req, { refreshed, failed, avatars })
})

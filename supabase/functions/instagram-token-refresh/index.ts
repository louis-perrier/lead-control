// Rafraîchit chaque nuit les tokens Instagram longue durée qui expirent
// sous 10 jours. Un échec marque le compte expired, visible dans l'app.
import { admin, isCronCall, json, logEvent } from '../_shared/core.ts'

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
      await admin
        .from('channel_accounts')
        .update({ status: 'expired', last_error: `refresh: ${String(e).slice(0, 160)}` })
        .eq('id', account.id)
    }
  }

  if (failed > 0) {
    await logEvent('warn', 'instagram-token-refresh', `${failed} compte(s) Instagram non rafraîchi(s)`)
  }
  return json(req, { refreshed, failed })
})

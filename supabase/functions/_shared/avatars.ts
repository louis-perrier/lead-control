import { admin } from './core.ts'
import { GRAPH, getChannelToken } from './instagram.ts'

export const AVATAR_BUCKET = 'contact-avatars'
export const AVATAR_REFRESH_MS = 7 * 24 * 3600 * 1000
const MAX_AVATAR_BYTES = 300 * 1024

type AvatarTarget = {
  id: number
  user_id: string
  channel_account_id: string
  contact_external_id: string
}

// Demande séparée du nom et du pseudo : un refus sur la photo ne doit pas faire perdre le nom.
async function fetchProfilePicture(token: string, igScopedId: string): Promise<string | null | undefined> {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(igScopedId)}?fields=profile_pic&access_token=${encodeURIComponent(token)}`)
    if (!res.ok) return undefined
    const body = (await res.json()) as { profile_pic?: string }
    return body.profile_pic ?? null
  } catch (_) {
    return undefined
  }
}

export function avatarIsStale(checkedAt: string | null | undefined, now = Date.now()) {
  return !checkedAt || now - Date.parse(checkedAt) > AVATAR_REFRESH_MS
}

// Le lien Meta expire au bout de quelques jours : on garde une copie privée, jamais le lien.
export async function refreshContactAvatar(conv: AvatarTarget, token?: string | null) {
  const path = `${conv.user_id}/${conv.channel_account_id}/${conv.contact_external_id}`
  const checkedAt = new Date().toISOString()
  const markChecked = (patch: Record<string, unknown> = {}) =>
    admin.from('conversations').update({ contact_avatar_checked_at: checkedAt, ...patch }).eq('id', conv.id)
  try {
    const accessToken = token ?? (await getChannelToken(conv.channel_account_id))
    if (!accessToken) return
    const picture = await fetchProfilePicture(accessToken, conv.contact_external_id)
    // Échec côté Meta : on note la tentative pour ne pas rappeler l'API à chaque message.
    if (picture === undefined) {
      await markChecked()
      return
    }
    if (picture === null) {
      await admin.storage.from(AVATAR_BUCKET).remove([path])
      await markChecked({ contact_avatar_path: null })
      return
    }
    const res = await fetch(picture)
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    const bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null
    if (!bytes || !['image/jpeg', 'image/png', 'image/webp'].includes(type) || bytes.byteLength > MAX_AVATAR_BYTES) {
      await markChecked()
      return
    }
    const upload = await admin.storage
      .from(AVATAR_BUCKET)
      .upload(path, bytes, { contentType: type, upsert: true, cacheControl: '604800' })
    if (upload.error) {
      await markChecked()
      return
    }
    await markChecked({ contact_avatar_path: path })
  } catch (_) {
    // la photo est un confort, retentée au prochain passage
  }
}

export async function removeChannelAvatars(userId: string, channelAccountId: string) {
  const prefix = `${userId}/${channelAccountId}`
  for (let page = 0; page < 50; page++) {
    const { data } = await admin.storage.from(AVATAR_BUCKET).list(prefix, { limit: 100 })
    if (!data || data.length === 0) break
    await admin.storage.from(AVATAR_BUCKET).remove(data.map((f) => `${prefix}/${f.name}`))
    if (data.length < 100) break
  }
  await admin
    .from('conversations')
    .update({ contact_avatar_path: null, contact_avatar_checked_at: null })
    .eq('channel_account_id', channelAccountId)
}

'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const BUCKET = 'contact-avatars'
const URL_TTL_SECONDS = 3600
// Un lien signé change à chaque création : on le réutilise tant qu'il est valable, sinon
// le navigateur retélécharge toutes les photos à chaque rafraîchissement de la liste.
const REUSE_MS = 50 * 60 * 1000
const cache = new Map<string, { url: string; until: number }>()

export function useAvatarUrls(paths: (string | null | undefined)[]): Record<string, string> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))].sort()
  const { data } = useQuery({
    queryKey: ['avatar-urls', unique],
    enabled: unique.length > 0,
    staleTime: REUSE_MS,
    queryFn: async () => {
      const now = Date.now()
      const missing = unique.filter((p) => (cache.get(p)?.until ?? 0) <= now)
      if (missing.length > 0) {
        const { data: signed } = await createClient().storage.from(BUCKET).createSignedUrls(missing, URL_TTL_SECONDS)
        for (const item of signed ?? []) {
          if (item.path && item.signedUrl) cache.set(item.path, { url: item.signedUrl, until: now + REUSE_MS })
        }
      }
      return Object.fromEntries(unique.flatMap((p) => (cache.has(p) ? [[p, cache.get(p)!.url]] : [])))
    },
  })
  return data ?? {}
}

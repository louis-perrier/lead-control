import { createClient } from '@/lib/supabase/client'
import { isViewAsReadOnly } from '@/lib/view-as/state'

const VIEW_AS_ALLOWED_PATHS = ['media-signed-url', 'context-documents/quota', 'billing/info']

export async function callFunction<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  if (isViewAsReadOnly() && !VIEW_AS_ALLOWED_PATHS.includes(path)) {
    throw new Error('view_as_readonly')
  }
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('not_authenticated')
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${path}`, {
    method: init.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      authorization: `Bearer ${session.access_token}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((payload as { error?: string }).error ?? `http_${res.status}`)
  }
  return payload as T
}

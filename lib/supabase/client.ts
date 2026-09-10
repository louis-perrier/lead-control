import { createBrowserClient } from '@supabase/ssr'
import { isViewAsReadOnly } from '@/lib/view-as/state'

const READ_ONLY_ERROR = { message: 'Lecture seule : mode "voir comme" actif.', code: 'view_as_readonly' }

function blocked() {
  return Promise.resolve({ data: null, error: READ_ONLY_ERROR })
}

function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export function createClient() {
  const client = makeClient()
  if (!isViewAsReadOnly()) return client

  // Mode "voir comme" : select passe, toute mutation renvoie une erreur propre
  // au lieu de partir en base, quel que soit le composant appelant.
  const originalFrom = client.from.bind(client)
  client.from = ((table: string) => {
    const builder = originalFrom(table)
    for (const method of ['insert', 'update', 'upsert', 'delete'] as const) {
      // @ts-expect-error surcharge volontaire pour bloquer les mutations en lecture seule
      builder[method] = blocked
    }
    return builder
  }) as typeof client.from

  client.rpc = (() => blocked()) as unknown as typeof client.rpc

  const originalStorageFrom = client.storage.from.bind(client.storage)
  client.storage.from = ((bucket: string) => {
    const storageBuilder = originalStorageFrom(bucket)
    for (const method of ['upload', 'remove', 'move', 'copy'] as const) {
      // @ts-expect-error idem
      storageBuilder[method] = blocked
    }
    return storageBuilder
  }) as typeof client.storage.from

  return client
}

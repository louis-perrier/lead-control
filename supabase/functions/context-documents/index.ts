// Documents de contexte (RAG) : le fichier est déjà dans le bucket privé
// context-documents/<user_id>/... (upload direct depuis le navigateur, RLS storage).
// Cette fonction lit le fichier avec la clé service role pour en extraire le texte,
// seule étape qui ne peut pas se faire côté client.
import { admin, getUser, handleOptions, json } from '../_shared/core.ts'

const MAX_CHARS = 40_000

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)

  const url = new URL(req.url)

  if (req.method === 'DELETE') {
    const id = url.pathname.split('/').pop()
    const { data: doc } = await admin
      .from('context_documents')
      .select('id, user_id, storage_path')
      .eq('id', id)
      .maybeSingle()
    if (!doc || doc.user_id !== user.id) return json(req, { error: 'not_found' }, 404)
    await admin.storage.from('context-documents').remove([doc.storage_path])
    await admin.from('context_documents').delete().eq('id', doc.id)
    return json(req, { ok: true })
  }

  if (req.method === 'POST' && url.pathname.endsWith('/register')) {
    let body: { storage_path?: string; title?: string; mime_type?: string } = {}
    try {
      body = await req.json()
    } catch {
      return json(req, { error: 'invalid_body' }, 400)
    }
    const storagePath = body.storage_path ?? ''
    const title = (body.title ?? '').trim().slice(0, 140)
    if (!storagePath.startsWith(`${user.id}/`) || !title) {
      return json(req, { error: 'invalid_path' }, 400)
    }

    const { count } = await admin
      .from('context_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    const { data: maxDocs } = await admin.rpc('max_context_documents', { p_user_id: user.id })
    const max = Number(maxDocs ?? 0)
    if ((count ?? 0) >= max) {
      await admin.storage.from('context-documents').remove([storagePath])
      return json(req, { error: 'quota_reached', max }, 409)
    }

    const { data: inserted, error: insertError } = await admin
      .from('context_documents')
      .insert({ user_id: user.id, title, storage_path: storagePath, mime_type: body.mime_type ?? null })
      .select('id')
      .single()
    if (insertError) return json(req, { error: 'insert_failed' }, 500)

    const download = await admin.storage.from('context-documents').download(storagePath)
    if (download.error) {
      await admin
        .from('context_documents')
        .update({ status: 'error', error_message: 'Fichier introuvable après import.' })
        .eq('id', inserted.id)
      return json(req, { error: 'download_failed' }, 500)
    }
    const rawText = await download.data.text()
    const text = rawText.slice(0, MAX_CHARS).trim()
    if (!text) {
      await admin
        .from('context_documents')
        .update({ status: 'error', error_message: 'Le document ne contient aucun texte lisible.' })
        .eq('id', inserted.id)
      return json(req, { ok: true, id: inserted.id, status: 'error' })
    }
    await admin
      .from('context_documents')
      .update({ status: 'ready', extracted_text: text, char_count: text.length, updated_at: new Date().toISOString() })
      .eq('id', inserted.id)
    return json(req, { ok: true, id: inserted.id, status: 'ready' })
  }

  if (req.method === 'GET' && url.pathname.endsWith('/quota')) {
    const { data: maxDocs } = await admin.rpc('max_context_documents', { p_user_id: user.id })
    const { count } = await admin
      .from('context_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    return json(req, { max: Number(maxDocs ?? 0), used: count ?? 0 })
  }

  return json(req, { error: 'Not found' }, 404)
})

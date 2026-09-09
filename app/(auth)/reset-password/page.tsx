'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input, Label, FieldError } from '@/components/ui/input'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)))
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('Le lien a expiré. Refaites une demande de réinitialisation.')
      setLoading(false)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-[10px] bg-success/10 px-3 py-2.5 text-sm text-success">
          Mot de passe mis à jour.
        </p>
        <Button className="w-full" onClick={() => router.replace('/app')}>
          Accéder à mon espace
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-lg font-semibold">Nouveau mot de passe</h1>
      {!ready ? (
        <p className="text-sm text-muted">
          Ouvrez cette page depuis le lien reçu par email pour définir un nouveau mot de passe.
        </p>
      ) : null}
      <div>
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="confirm">Confirmer le mot de passe</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <FieldError>{error}</FieldError>
      </div>
      <Button type="submit" className="w-full" disabled={loading || !ready}>
        {loading ? 'Mise à jour…' : 'Mettre à jour'}
      </Button>
    </form>
  )
}

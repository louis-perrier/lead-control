'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input, Label, FieldError, FieldHint } from '@/components/ui/input'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError('Impossible de créer le compte avec ces informations.')
      setLoading(false)
      return
    }
    router.replace('/app')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Créer un compte</h1>
        <p className="mt-0.5 text-sm text-muted">
          Votre assistant Instagram est prêt en quelques minutes.
        </p>
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
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
        <FieldHint>8 caractères minimum.</FieldHint>
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
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Création…' : 'Créer mon compte'}
      </Button>
      <p className="text-center text-sm text-muted">
        Déjà un compte ?{' '}
        <Link href="/login" className="font-medium text-primary hover:text-primary-hover">
          Se connecter
        </Link>
      </p>
    </form>
  )
}

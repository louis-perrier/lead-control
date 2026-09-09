'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
    })
    setSent(true)
    setLoading(false)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mot de passe oublié</h1>
        <p className="mt-0.5 text-sm text-muted">
          Recevez un lien de réinitialisation par email.
        </p>
      </div>
      {sent ? (
        <p className="rounded-[10px] bg-success/10 px-3 py-2.5 text-sm text-success">
          Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.
        </p>
      ) : (
        <>
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Envoi…' : 'Envoyer le lien'}
          </Button>
        </>
      )}
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted hover:text-ink">
          Retour à la connexion
        </Link>
      </p>
    </form>
  )
}

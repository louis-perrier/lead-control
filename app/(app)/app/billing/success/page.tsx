'use client'

import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'

export default function BillingSuccessPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 size={40} className="text-success" />
          <h1 className="text-lg font-semibold">Paiement confirmé</h1>
          <p className="text-sm text-muted">
            Votre assistant est prêt. Prochaine étape : relier votre compte Instagram et le
            configurer.
          </p>
          <Link href="/app" className="mt-2">
            <Button>Commencer la mise en place</Button>
          </Link>
        </CardBody>
      </Card>
    </div>
  )
}

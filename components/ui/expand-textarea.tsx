'use client'

import { useCallback, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { Textarea } from './input'
import { Dialog } from './dialog'
import { Button } from './button'

/** Zone de texte avec un bouton qui l'ouvre en grand, sans changer la façon dont elle s'enregistre. */
export function ExpandableTextarea({ title, className, ...props }: React.ComponentProps<'textarea'> & { title: string }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <div className="relative">
      <Textarea className={className ? `${className} pr-9` : 'pr-9'} {...props} />
      <button
        type="button"
        aria-label="Agrandir"
        title="Agrandir"
        onClick={() => setOpen(true)}
        className="absolute right-2 top-2 rounded-md p-1 text-muted hover:bg-bg hover:text-ink"
      >
        <Maximize2 size={14} />
      </button>
      <Dialog open={open} onClose={close} title={title} size="full" footer={<Button onClick={close}>Fermer</Button>}>
        <Textarea {...props} id={undefined} className="min-h-0 flex-1 resize-none" autoFocus />
      </Dialog>
    </div>
  )
}

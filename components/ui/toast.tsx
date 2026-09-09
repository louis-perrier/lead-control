'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

type Toast = { id: number; message: string; tone: 'success' | 'error' }

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = ++counter.current
    setToasts((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'animate-in pointer-events-auto flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5 text-sm shadow-soft',
              t.tone === 'success'
                ? 'border-border bg-surface text-ink'
                : 'border-danger/30 bg-surface text-danger',
            )}
          >
            {t.tone === 'success' ? (
              <CheckCircle2 size={16} className="shrink-0 text-success" />
            ) : (
              <CircleAlert size={16} className="shrink-0" />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

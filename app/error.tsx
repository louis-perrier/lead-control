'use client'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-4 text-center">
      <h1 className="text-lg font-semibold text-ink">Une erreur est survenue</h1>
      <p className="max-w-sm text-sm text-muted">
        Réessayez dans un instant. Si le problème persiste, contactez-nous depuis le bouton
        Donner mon avis.
      </p>
      <button
        onClick={reset}
        className="mt-2 rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
      >
        Réessayer
      </button>
    </div>
  )
}

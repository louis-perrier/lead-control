import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-4 text-center">
      <p className="text-5xl font-semibold text-border">404</p>
      <h1 className="text-lg font-semibold text-ink">Page introuvable</h1>
      <p className="text-sm text-muted">Cette page n'existe pas ou a été déplacée.</p>
      <Link
        href="/app"
        className="mt-2 rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
      >
        Retour à l'application
      </Link>
    </div>
  )
}

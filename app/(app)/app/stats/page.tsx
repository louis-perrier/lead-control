import { StatsContent } from '@/components/stats/stats-content'

export default function StatsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-xl font-semibold">Statistiques</h1>
      <p className="mt-1 text-sm text-muted">
        L'activité de votre assistant et vos résultats commerciaux.
      </p>
      <div className="mt-6">
        <StatsContent />
      </div>
    </div>
  )
}

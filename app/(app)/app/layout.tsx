import { AppShell } from '@/components/shell/app-shell'
import { Providers } from '../providers'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  )
}

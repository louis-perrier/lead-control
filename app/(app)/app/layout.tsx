import { AppShell } from '@/components/shell/app-shell'
import { ViewAsProvider } from '@/components/view-as/provider'
import { Providers } from '../providers'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <ViewAsProvider>
        <AppShell>{children}</AppShell>
      </ViewAsProvider>
    </Providers>
  )
}

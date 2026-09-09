import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-10">
      <Link href="/" className="mb-8">
        <img src="/logoMarque@2x.png" alt="LeadControl" className="h-9 w-auto" />
      </Link>
      <div className="w-full max-w-sm rounded-[14px] border border-border bg-surface p-6 shadow-soft">
        {children}
      </div>
    </div>
  )
}

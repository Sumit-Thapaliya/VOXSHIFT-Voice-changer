import type { Metadata } from 'next';
import './globals.css';
import './pages.css';
import { Providers } from '@/components/providers';
import { AppShell } from '@/components/app-shell';
export const metadata: Metadata = {
  title: 'VOXSHIFT — One voice. Infinite identities.',
  description:
    'Your next-generation voice studio. Explore voices, record your sound, and create something extraordinary.',
  icons: { icon: '/favicon.png' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="midnight" data-motion="full" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

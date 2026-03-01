import type { Metadata } from 'next';
import { AuthProvider } from '@/src/providers/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Technocracy – Crowd Deliberation Engine',
  description: 'Animated agents deliberate on your questions using AI-powered conversations',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

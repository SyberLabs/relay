import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Relay · SyberLabs',
  description: 'A private job-search workspace with history that stays intact.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

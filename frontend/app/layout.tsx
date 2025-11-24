import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Voice AI Agent',
  description: 'Chat with AI using voice or text',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

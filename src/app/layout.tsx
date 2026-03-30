import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gestor de Mídia',
  description: 'Gestor inteligente de vídeos e míusicas de Clubes e Eventos',
};

export default function RootLayout({
  children,
}: {children: React.ReactNode}) {
  return (
    <!DOCTYPE html>
    <html lang="pt">
      <head>
        <code>code-var()</code>
      </head>
      <body>
        {cildren}
      </body>
    </html>
  );
}

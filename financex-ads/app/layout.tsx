import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "FinanceX ADS",
  description: "Publique em todas as suas contas e acompanhe suas comissões.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Instrument+Serif&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="top">
          <div className="wrap">
            <a className="brand" href="/">FinanceX <span>ADS</span></a>
            <nav className="nav">
              <a href="/">Painel</a>
              <a href="/contas">Contas</a>
              <a href="/clientes">Clientes</a>
              <a href="/criativos">Criativos</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}

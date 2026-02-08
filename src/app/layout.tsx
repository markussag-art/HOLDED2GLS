import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Holded2GLS — Tracking Sync",
  description: "Shipment tracking synchronization between GLS/MRW and Holded",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen bg-background">
          <header className="border-b border-gray-200 dark:border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                <a href="/" className="text-xl font-bold text-foreground">
                  Holded2GLS
                </a>
                <nav className="flex gap-4 text-sm">
                  <a
                    href="/"
                    className="text-gray-600 hover:text-foreground dark:text-gray-400"
                  >
                    Shipments
                  </a>
                </nav>
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

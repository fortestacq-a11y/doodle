import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus - AI Integration Platform",
  description: "Universal AI Integration Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-64 border-r bg-gray-50 p-4">
            <h1 className="mb-8 text-xl font-bold text-nexus-700">Nexus</h1>
            <nav className="space-y-1">
              <a href="/" className="block rounded px-3 py-2 text-sm font-medium hover:bg-gray-100">Dashboard</a>
              <a href="/connections" className="block rounded px-3 py-2 text-sm font-medium hover:bg-gray-100">Connections</a>
              <a href="/tools" className="block rounded px-3 py-2 text-sm font-medium hover:bg-gray-100">Tools</a>
              <a href="/executions" className="block rounded px-3 py-2 text-sm font-medium hover:bg-gray-100">Executions</a>
              <a href="/settings" className="block rounded px-3 py-2 text-sm font-medium hover:bg-gray-100">Settings</a>
            </nav>
          </aside>
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}

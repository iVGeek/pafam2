import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Perfumes+ — Perfume Wholesale Trading",
  description:
    "Supplier offers, product master, exception queue and trading decisions.",
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/offers", label: "Offers" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/exposure", label: "Exposure" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/deals", label: "Deals" },
  { href: "/quotes", label: "Quotes" },
  { href: "/inventory", label: "Inventory" },
  { href: "/demands", label: "Demand" },
  { href: "/pricing", label: "Pricing" },
  { href: "/trends", label: "Trends" },
  { href: "/alerts", label: "Alerts" },
  { href: "/kpis", label: "KPIs" },
  { href: "/notes", label: "Notes" },
  { href: "/tasks", label: "Tasks" },
  { href: "/customers", label: "Customers" },
  { href: "/uploads", label: "Uploads" },
  { href: "/exceptions", label: "Exceptions" },
  { href: "/products", label: "Products" },
  { href: "/fx", label: "FX" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Perfumes+
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <a
              href="/api/template"
              className="ml-auto rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Download template
            </a>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          {children}
        </main>
        <footer className="border-t border-zinc-200 px-6 py-4 text-xs text-zinc-500 dark:border-zinc-800">
          Records and history are authoritative here; Excel is import/export
          only.
        </footer>
      </body>
    </html>
  );
}

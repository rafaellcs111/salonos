import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./master.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: "SalonOS — O sistema operacional do seu negócio",
    description: "Agenda, clientes, equipe e financeiro em um único sistema para negócios de beleza.",
    icons: { icon: "/salonos-logo.png", shortcut: "/salonos-logo.png" },
    openGraph: {
      title: "SalonOS",
      description: "O sistema operacional do seu negócio.",
      images: [{ url: `${origin}/og.png`, width: 1536, height: 1024, alt: "SalonOS — gestão inteligente para negócios de beleza" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "SalonOS",
      description: "O sistema operacional do seu negócio.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}

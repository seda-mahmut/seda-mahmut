import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Seda & Mahmut | 12.12.2026", description: "Bu özel günümüzde bizimle olduğunuz için teşekkür ederiz." };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="tr"><body>{children}</body></html>;
}

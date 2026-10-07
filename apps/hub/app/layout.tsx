import "@apex/ui/tokens.css";
import "./hub.css";

export const metadata = { title: "Apex — Portal", robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca">
      <body>{children}</body>
    </html>
  );
}

import "@apex/ui/tokens.css";
import "./sign.css";

// The signer pages: public, for people who have a personal link. Never indexed, no referrer sent, nothing third-party.
export const metadata = {
  title: "Apex — Signatura electrònica",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default function SignLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca">
      <body className="s-body">{children}</body>
    </html>
  );
}

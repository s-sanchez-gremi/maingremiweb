import type { Social } from "@apex/sections/settings-schema";

const NAME: Record<Social["network"], string> = { facebook: "Facebook", x: "X", instagram: "Instagram", youtube: "YouTube", linkedin: "LinkedIn" };

// Simple stroke/fill glyphs (no third-party icon code, nothing loaded from elsewhere).
const glyph: Record<Social["network"], React.ReactNode> = {
  facebook: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v6h4v-6h3l1-4h-4V8.5a.5.5 0 0 1 .5-.5z" fill="currentColor" />,
  x: <path d="M5 4l14 16M19 4L5 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />,
  instagram: <><rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17" cy="7" r="1.2" fill="currentColor" /></>,
  youtube: <><rect x="3" y="6" width="18" height="12" rx="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" /></>,
  linkedin: <><rect x="4" y="9" width="3.4" height="11" fill="currentColor" /><circle cx="5.7" cy="5.5" r="2" fill="currentColor" /><path d="M10.5 9h3.2v1.6c.6-1 1.8-1.9 3.5-1.9 3 0 3.8 2 3.8 4.6V20h-3.4v-5.7c0-1.3-.3-2.3-1.6-2.3-1.4 0-2.1 1-2.1 2.4V20h-3.4z" fill="currentColor" /></>,
};

export function SocialLinks({ items }: { items: Social[] }) {
  if (!items.length) return null;
  return (
    <ul className="social">
      {items.map((s, i) => (
        <li key={i}>
          <a href={s.url} rel="noopener noreferrer" aria-label={NAME[s.network]}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{glyph[s.network]}</svg>
          </a>
        </li>
      ))}
    </ul>
  );
}

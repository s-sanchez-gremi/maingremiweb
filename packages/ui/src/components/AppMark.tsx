import { APPS, halftoneDots, type AppKey } from "../appmark";

/** The square mark of an app: its ink, its letter and a halftone fade. Decorative next to the app's name (aria-hidden). */
export function AppMark({ app, size = 32 }: { app: AppKey; size?: number }) {
  const a = APPS[app];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" style={{ flex: "none", borderRadius: size > 24 ? 4 : 3 }}>
      <rect width="64" height="64" fill={a.spot} />
      <g fill={a.on} opacity={0.28}>
        {halftoneDots(7, 7, 1).map((d, i) => <circle key={i} cx={+(d.cx * 0.64).toFixed(1)} cy={+(d.cy * 0.64).toFixed(1)} r={+(d.r * 0.64).toFixed(2)} />)}
      </g>
      <text x="32" y="45" textAnchor="middle" fontFamily="var(--serif)" fontWeight={700} fontSize={38} fill={a.on}>{a.letter}</text>
    </svg>
  );
}

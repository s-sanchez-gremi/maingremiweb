import type { ReactNode } from "react";

/** Card shell. `image` is an optional media slot; the whole card is clickable via a stretched link inside `children`. */
export function Card({ image, children }: { image?: ReactNode; children: ReactNode }) {
  return (
    <article className="card">
      {image !== undefined && <div className="img">{image}</div>}
      <div className="body">{children}</div>
    </article>
  );
}

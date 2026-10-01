import type { ReactNode } from "react";

/** Card shell. `image` is an optional media slot; the whole card is clickable via a stretched link inside `children`.
 *  `linked` marks a card that leads somewhere, so it gets a hover lift and an arrow cue. */
export function Card({ image, linked, children }: { image?: ReactNode; linked?: boolean; children: ReactNode }) {
  const cls = ["card", image === undefined && "no-img", linked && "linked"].filter(Boolean).join(" ");
  return (
    <article className={cls}>
      {image !== undefined && <div className="img">{image}</div>}
      <div className="body">{children}</div>
    </article>
  );
}

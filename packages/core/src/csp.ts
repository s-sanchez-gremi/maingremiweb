// Content Security Policy, built per request type. Its main job: no third-party script can ever run on the site, so
// "nothing non-essential loads before consent" is enforced by the browser, not just by our own code.
// Known trade-off: script/style allow 'unsafe-inline' because pages are cached and pre-rendered (a per-request nonce
// would make every page dynamic). Third-party origins are still blocked.
// "editor" = the admin content editor, which frames its own live preview; "preview" = that preview page (staff only,
// renders the draft like the public site and may be framed by our own origin only).
export type Kind = "public" | "embed" | "admin" | "editor" | "preview";

// previewOrigin / editorOrigin / adminOrigin are only for the two-origin setup of development and tests, where the CMS admin and the
// website run on different ports: the editor may frame the website's preview there, the preview may be framed by the admin, and the
// website's staff bar may post to the admin. Behind Caddy (production) everything is one origin and none of them is set.
export function buildCsp(kind: Kind, o: { s3Origin?: string; dev?: boolean; https?: boolean; previewOrigin?: string; editorOrigin?: string; adminOrigin?: string }): string {
  const s3 = o.s3Origin ? ` ${o.s3Origin}` : "";
  const d: string[] = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${o.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${s3}`,
    `media-src 'self'${s3}`,
    "font-src 'self'",
    `connect-src 'self'${o.dev ? " ws: wss:" : ""}`,
    kind === "admin" ? "frame-src 'none'" : kind === "editor" ? `frame-src 'self'${o.previewOrigin ? ` ${o.previewOrigin}` : ""}` : "frame-src https://www.youtube-nocookie.com https://adobe.com https://*.adobe.com",
    `form-action 'self'${kind === "public" && o.adminOrigin ? ` ${o.adminOrigin}` : ""}`,
    "base-uri 'self'",
    "object-src 'none'",
  ];
  if (kind !== "embed") d.push(kind === "admin" || kind === "editor" ? "frame-ancestors 'none'" : `frame-ancestors 'self'${kind === "preview" && o.editorOrigin ? ` ${o.editorOrigin}` : ""}`); // /embed is meant to be framed
  if (o.https) d.push("upgrade-insecure-requests");
  return d.join("; ");
}

export const kindOf = (firstSegment: string, secondSegment = ""): Kind =>
  firstSegment === "admin" && secondSegment === "preview" ? "preview"
  : firstSegment === "admin" && secondSegment === "content" ? "editor"
  : firstSegment === "admin" || firstSegment === "api" || firstSegment === "portal" ? "admin" : firstSegment === "embed" ? "embed" : "public";

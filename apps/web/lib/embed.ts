// Turns a pasted YouTube/Adobe link into something safe to frame. Callers must have validated the host (isAllowedEmbed).
export function embedTarget(url: string): { src: string; title: string; provider: "youtube" | "adobe" } | null {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    if (h === "youtu.be" || h.endsWith("youtube.com")) {
      const id = h === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") ?? u.pathname.split("/").filter(Boolean).pop() ?? "";
      if (!/^[\w-]{6,20}$/.test(id)) return null;
      return { src: `https://www.youtube-nocookie.com/embed/${id}`, title: "YouTube", provider: "youtube" };
    }
    if (h === "adobe.com" || h.endsWith(".adobe.com")) return { src: u.toString(), title: "Adobe", provider: "adobe" };
  } catch { /* fall through */ }
  return null;
}

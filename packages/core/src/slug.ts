export function slugify(input: string): string {
  return input
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // strip accents (à → a, ç → c)
    .toLowerCase().replace(/l·l/g, "ll")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

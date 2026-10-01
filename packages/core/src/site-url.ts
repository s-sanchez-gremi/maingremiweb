// The public address of the site (SITE_URL), without a trailing slash. Used in emails and absolute links.
export const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

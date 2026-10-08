// Where the CMS admin app lives, for links from the website to it (staff bar, preview): its own host in production
// (https://admin.<domain>), its own port in development. Empty only if the admin were served from the website's own address.
export const adminUrl = () => (process.env.ADMIN_URL ?? "").replace(/\/$/, "");

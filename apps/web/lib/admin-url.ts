// Where the CMS admin app lives, for links from the website to it (staff bar, preview). Empty = same address as the website,
// which is how production works (Caddy sends /admin/* to the admin app); in development each app has its own port, so set ADMIN_URL.
export const adminUrl = () => (process.env.ADMIN_URL ?? "").replace(/\/$/, "");

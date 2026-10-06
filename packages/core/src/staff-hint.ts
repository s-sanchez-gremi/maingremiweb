// The "this browser has signed in to the admin" hint for the staff bar (lib/admin-bar.ts). It holds no secret: the real
// check is always the httpOnly session cookie. Set on login, removed on sign-out; a stale one is removed by the bar itself.
import { cookies } from "next/headers";
import { STAFF_HINT } from "./staff-cookie";

const DOMAIN = process.env.SESSION_COOKIE_DOMAIN || undefined; // same as the session cookie (see auth.ts)

export async function setStaffHint() {
  (await cookies()).set(STAFF_HINT, "1", {
    httpOnly: false, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 14 * 24 * 60 * 60, domain: DOMAIN,
  });
}

export async function clearStaffHint() {
  (await cookies()).set(STAFF_HINT, "", { path: "/", maxAge: 0, domain: DOMAIN });
}

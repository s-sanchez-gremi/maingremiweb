"use client";
// Sessions that started before the staff bar existed have no hint cookie; set it from the admin so the bar appears.
import { useEffect } from "react";
import { STAFF_HINT } from "@apex/core/staff-cookie";

/** domain: the shared cookie domain (SESSION_COOKIE_DOMAIN) when the website lives on another host of the same site. */
export function StaffHint({ domain }: { domain?: string }) {
  useEffect(() => {
    if (!document.cookie.split("; ").includes(`${STAFF_HINT}=1`)) {
      document.cookie = `${STAFF_HINT}=1; path=/; max-age=${14 * 24 * 60 * 60}; samesite=lax${domain ? `; domain=${domain}` : ""}${location.protocol === "https:" ? "; secure" : ""}`;
    }
  }, [domain]);
  return null;
}

"use client";
// Sessions that started before the staff bar existed have no hint cookie; set it from the admin so the bar appears.
import { useEffect } from "react";
import { STAFF_HINT } from "@/lib/staff-cookie";

export function StaffHint() {
  useEffect(() => {
    if (!document.cookie.split("; ").includes(`${STAFF_HINT}=1`)) {
      document.cookie = `${STAFF_HINT}=1; path=/; max-age=${14 * 24 * 60 * 60}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    }
  }, []);
  return null;
}

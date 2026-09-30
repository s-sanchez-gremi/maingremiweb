"use client";
// Browser-side consent store. `undefined` = not known yet (server render / before hydration), `null` = no valid choice
// (show the banner), otherwise the visitor's choice. Non-essential features must wait for an explicit `true`.
import { useSyncExternalStore } from "react";
import { parseConsent, serializeConsent, type Consent } from "@/lib/consent/state";

let current: Consent | null | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const snapshot = (): Consent | null | undefined => {
  if (current === undefined && typeof document !== "undefined") current = parseConsent(document.cookie);
  return current;
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const useConsent = () => useSyncExternalStore(subscribe, snapshot, () => undefined);

const UTM_KEY = "apex_utm";
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

export function clearStoredUtm() { try { sessionStorage.removeItem(UTM_KEY); } catch { /* storage blocked: nothing to clear */ } }
export function storedUtm(): Record<string, string> { try { return JSON.parse(sessionStorage.getItem(UTM_KEY) ?? "{}"); } catch { return {}; } }
export function captureUtm() {
  const found: Record<string, string> = {};
  const p = new URLSearchParams(window.location.search);
  for (const k of UTM) { const v = p.get(k); if (v) found[k] = v.slice(0, 100); }
  if (Object.keys(found).length) { try { sessionStorage.setItem(UTM_KEY, JSON.stringify(found)); } catch { /* ignore */ } }
}

export function saveConsent(choice: { attribution: boolean; embeds: boolean }) {
  document.cookie = serializeConsent(choice, window.location.protocol === "https:");
  current = parseConsent(document.cookie) ?? { v: 1, t: new Date().toISOString(), ...choice };
  if (!choice.attribution) clearStoredUtm(); // withdrawing consent removes what we kept
  emit();
}

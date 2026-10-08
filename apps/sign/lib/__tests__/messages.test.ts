import { describe, expect, it } from "vitest";
import { CONSENT, CONSENT_VERSION, UI, declinedEmail, fill, invitationEmail, isLocale, type Locale } from "@apex/sign/messages";

const LOCALES: Locale[] = ["ca", "es", "en"];
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("the words signers see", () => {
  it("has every message in every language, none empty, with the same placeholders everywhere", () => {
    for (const k of Object.keys(UI.ca) as (keyof typeof UI.ca)[]) {
      for (const l of LOCALES) {
        expect(UI[l][k], `${l}.${k}`).toBeTruthy();
        expect(placeholders(UI[l][k]), `${l}.${k}`).toBe(placeholders(UI.ca[k]));
      }
    }
    for (const l of LOCALES) expect(Object.keys(UI[l]).sort()).toEqual(Object.keys(UI.ca).sort());
  });

  it("has the consent wording in every language, marked as a placeholder until the legal adviser approves it", () => {
    for (const l of LOCALES) expect(CONSENT[l].length).toBeGreaterThan(80);
    expect(CONSENT_VERSION).toMatch(/placeholder/);
  });

  it("fills placeholders and recognises locales", () => {
    expect(fill("Hola {name}, pàgina {n}", { name: "Anna", n: 2 })).toBe("Hola Anna, pàgina 2");
    expect(fill("{missing}!")).toBe("!");
    expect(isLocale("ca") && isLocale("es") && isLocale("en")).toBe(true);
    for (const bad of ["fr", "", null, undefined, 3]) expect(isLocale(bad)).toBe(false);
  });
});

describe("the emails", () => {
  const base = { name: "Anna Puig", title: "Contracte", link: "https://sign.exemple.test/sign/TOKEN", message: "Si us plau, signeu-lo avui.", expiresOn: "2026-10-21" };

  it("invites a signer in their language with the link, the expiry day and the sender's message", () => {
    for (const l of LOCALES) {
      const m = invitationEmail({ ...base, locale: l });
      expect(m.subject).toContain("Contracte");
      expect(m.text).toContain(base.link);
      expect(m.text).toContain("2026-10-21");
      expect(m.text).toContain("Anna Puig");
      expect(m.text).toContain(base.message);
    }
    expect(invitationEmail({ ...base, locale: "ca" }).subject).toMatch(/signatura/i);
    expect(invitationEmail({ ...base, locale: "es" }).subject).toMatch(/firma/i);
    expect(invitationEmail({ ...base, locale: "en" }).subject).toMatch(/signature/i);
  });

  it("leaves out the message part when there is none", () => {
    expect(invitationEmail({ ...base, locale: "en", message: "  " }).text).not.toContain("Message from");
  });

  it("tells the staff member who declined, why, and where to look", () => {
    const m = declinedEmail({ signerName: "Biel", signerEmail: "biel@exemple.test", title: "Contracte", reason: "Preu massa alt", link: "https://sign.exemple.test/admin/requests/1" });
    expect(m.subject).toContain("Contracte");
    expect(m.text).toContain("Biel (biel@exemple.test)");
    expect(m.text).toContain("Preu massa alt");
    expect(m.text).toContain("https://sign.exemple.test/admin/requests/1");
    expect(declinedEmail({ signerName: "B", signerEmail: "b@x.test", title: "T", reason: "", link: "l" }).text).toContain("No ha indicat cap motiu");
  });
});

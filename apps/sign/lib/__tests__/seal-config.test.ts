import { describe, expect, it } from "vitest";
import { generateSelfSigned } from "@apex/sign/cert";
import { sealedEmail, sealedStaffEmail } from "@apex/sign/messages-sealed";
import { daysLeft, loadSealCredentials, sealProblems } from "@/lib/seal-config";

const PASS = "organisation-passphrase";
const good = generateSelfSigned({ commonName: "Gremi seal", passphrase: PASS });
const env = (over: Record<string, string | undefined> = {}) => ({ SIGN_SEAL_P12: good.p12.toString("base64"), SIGN_SEAL_PASSPHRASE: PASS, ...over });

describe("the startup check of the seal certificate", () => {
  it("accepts a good certificate", () => {
    expect(sealProblems(env())).toEqual([]);
  });
  it("says what is missing", () => {
    expect(sealProblems({})[0]).toMatch(/SIGN_SEAL_P12 is not set/);
    expect(sealProblems(env({ SIGN_SEAL_P12: "   " }))[0]).toMatch(/SIGN_SEAL_P12 is not set/);
    expect(sealProblems(env({ SIGN_SEAL_PASSPHRASE: "" }))[0]).toMatch(/SIGN_SEAL_PASSPHRASE is not set/);
  });
  it("says when the file cannot be opened", () => {
    expect(sealProblems(env({ SIGN_SEAL_PASSPHRASE: "wrong" }))[0]).toMatch(/cannot be opened/);
    expect(sealProblems(env({ SIGN_SEAL_P12: Buffer.from("not a certificate").toString("base64") }))[0]).toMatch(/cannot be opened/);
  });
  it("refuses a certificate that has expired or is not valid yet", () => {
    const old = generateSelfSigned({ commonName: "Old", passphrase: PASS, years: 1, now: new Date(Date.now() - 3 * 365 * 86_400_000) });
    expect(sealProblems(env({ SIGN_SEAL_P12: old.p12.toString("base64") }))[0]).toMatch(/expired on \d{4}-\d{2}-\d{2}/);
    const future = generateSelfSigned({ commonName: "Future", passphrase: PASS, now: new Date(Date.now() + 10 * 86_400_000) });
    expect(sealProblems(env({ SIGN_SEAL_P12: future.p12.toString("base64") }))[0]).toMatch(/not valid until/);
  });
  it("counts the days left", () => {
    expect(daysLeft(good, new Date())).toBeGreaterThan(1090);
    expect(daysLeft({ notAfter: new Date(Date.now() - 2 * 86_400_000) })).toBeLessThan(0);
  });
});

describe("loading the certificate", () => {
  it("reads the organisation's certificate from the environment", () => {
    const c = loadSealCredentials(env());
    expect(c).toMatchObject({ commonName: "Gremi seal", fingerprint: good.fingerprint });
  });
  it("makes one throwaway certificate for development and reuses it", () => {
    const a = loadSealCredentials({}), b = loadSealCredentials({});
    expect(a.commonName).toMatch(/development/i);
    expect(b.fingerprint).toBe(a.fingerprint);
  });
  it("never falls back to the throwaway one in staging or production", () => {
    expect(() => loadSealCredentials({ NODE_ENV: "production", APP_ENV: "staging" })).toThrow(/SIGN_SEAL_P12 is not set/);
    expect(() => loadSealCredentials({ NODE_ENV: "production", APP_ENV: "production" })).toThrow(/SIGN_SEAL_P12 is not set/);
    expect(loadSealCredentials({ NODE_ENV: "production", APP_ENV: "production", ...env() }).commonName).toBe("Gremi seal");
  });
});

describe("the emails that send the signed copy", () => {
  const o = { name: "Anna Puig", title: "Contracte", link: "https://sign.exemple.test/sign/dl/TOKEN", expiresOn: "2026-10-28" };
  it("give each signer their link, the last day and a reminder to keep the file, in their language", () => {
    for (const locale of ["ca", "es", "en"] as const) {
      const m = sealedEmail({ locale, ...o });
      expect(m.subject).toContain("Contracte");
      for (const needle of [o.link, "2026-10-28", "Anna Puig"]) expect(m.text).toContain(needle);
    }
    expect(sealedEmail({ locale: "ca", ...o }).subject).toMatch(/signat/i);
    expect(sealedEmail({ locale: "es", ...o }).subject).toMatch(/firmado/i);
    expect(sealedEmail({ locale: "en", ...o }).subject).toMatch(/signed/i);
  });
  it("tell the staff member who signed and where to look", () => {
    const m = sealedStaffEmail({ title: "Contracte", link: "https://sign.exemple.test/admin/requests/1", signers: ["Anna", "Biel"] });
    expect(m.text).toContain("Anna, Biel");
    expect(m.text).toContain("https://sign.exemple.test/admin/requests/1");
  });
});

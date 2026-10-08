// The certificate that seals finished documents. A PKCS#12 file (.p12) holds the private key and the certificate.
// Production uses the organisation's own file (SIGN_SEAL_P12, base64) with its passphrase; development and tests make a throwaway
// self-signed one in memory. A self-signed certificate does NOT make Acrobat say "valid identity": it proves that nothing changed after
// sealing (any edit breaks the signature), not who sealed it. A certificate from a recognised authority can replace it later with
// no change to anything else.
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import forge from "node-forge";

export type SealCredentials = {
  p12: Buffer;
  passphrase: string;
  commonName: string;
  notBefore: Date;
  notAfter: Date;
  /** SHA-256 of the certificate, hex */
  fingerprint: string;
  selfSigned: boolean;
};

type Described = Omit<SealCredentials, "p12" | "passphrase">;

/** Opens a .p12 and says what is in it. Throws with a plain message when the passphrase is wrong or the file has no key and certificate. */
export function describeP12(p12: Buffer, passphrase: string): Described {
  let parsed: forge.pkcs12.Pkcs12Pfx;
  try {
    parsed = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12.toString("binary")), passphrase);
  } catch (e) {
    throw new Error(`The seal certificate (.p12) cannot be opened: wrong passphrase or an unsupported file (${String((e as Error)?.message ?? e).slice(0, 120)})`);
  }
  const certs = (parsed.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b) => b.cert).filter((c): c is forge.pki.Certificate => !!c);
  const keys = [
    ...(parsed.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(parsed.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  if (!certs.length || !keys.length) throw new Error("The seal certificate (.p12) must contain a private key and a certificate");
  const cert = certs[0];
  const cn = cert.subject.getField("CN")?.value;
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return {
    commonName: typeof cn === "string" && cn ? cn : "Apex",
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    fingerprint: createHash("sha256").update(Buffer.from(der, "binary")).digest("hex"),
    selfSigned: cert.issuer.hash === cert.subject.hash,
  };
}

/** A new self-signed certificate and key (RSA 2048, SHA-256), as a .p12 protected by the passphrase. */
export function generateSelfSigned(o: { commonName: string; organization?: string; years?: number; passphrase: string; now?: Date }): SealCredentials {
  const now = o.now ?? new Date();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 }); // native and fast; forge only builds the certificate
  const key = forge.pki.privateKeyFromPem(privateKey.export({ type: "pkcs8", format: "pem" }) as string);
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: "spki", format: "pem" }) as string);
  cert.serialNumber = "01" + randomBytes(8).toString("hex");
  cert.validity.notBefore = new Date(now.getTime() - 60_000);
  cert.validity.notAfter = new Date(now.getTime() + (o.years ?? 3) * 365.25 * 86_400_000);
  const name = [{ name: "commonName", value: o.commonName }, ...(o.organization ? [{ name: "organizationName", value: o.organization }] : []), { name: "countryName", value: "ES" }];
  cert.setSubject(name);
  cert.setIssuer(name);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
  ]);
  cert.sign(key, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(key, [cert], o.passphrase, { algorithm: "3des", friendlyName: o.commonName });
  const p12 = Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
  return { p12, passphrase: o.passphrase, ...describeP12(p12, o.passphrase) };
}

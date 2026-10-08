// The certificate that seals finished documents. Two PEM files: the certificate (SIGN_SEAL_CERT) and its encrypted private key (SIGN_SEAL_KEY), each as base64,
// with the key's passphrase. (A .p12 from an authority converts with openssl: see docs/esign-plan.md.) Production uses the organisation's own; development and tests make a throwaway
// self-signed one in memory. A self-signed certificate does NOT make Acrobat say "valid identity": it proves that nothing changed after
// sealing (any edit breaks the signature), not who sealed it. A certificate from a recognised authority can replace it later with
// no change to anything else.
import { X509Certificate, createPrivateKey, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

export type SealCredentials = {
  /** certificate (chain) in PEM */
  certPem: string;
  /** private key in PEM, PKCS#8, encrypted with the passphrase */
  keyPem: string;
  passphrase: string;
  commonName: string;
  notBefore: Date;
  notAfter: Date;
  /** SHA-256 of the certificate, hex */
  fingerprint: string;
  selfSigned: boolean;
};

type Described = Omit<SealCredentials, "certPem" | "keyPem" | "passphrase">;

const OID_CN = "2.5.4.3";
const OID_O = "2.5.4.10";
const OID_C = "2.5.4.6";

/** Opens the certificate and key and says what is in them. Throws with a plain message when the passphrase is wrong, the files are unreadable or the key does not belong to the certificate. */
export function describeSeal(certPem: string, keyPem: string, passphrase: string): Described {
  try {
    const cert = new X509Certificate(certPem);
    const key = createPrivateKey({ key: keyPem, format: "pem", passphrase });
    if (!cert.checkPrivateKey(key)) throw new Error("the key does not belong to the certificate");
    const cn = /CN=([^\n+]+)/.exec(cert.subject)?.[1]?.trim();
    return {
      commonName: cn || "Apex",
      notBefore: new Date(cert.validFrom),
      notAfter: new Date(cert.validTo),
      fingerprint: cert.fingerprint256.replace(/:/g, "").toLowerCase(),
      selfSigned: cert.subject === cert.issuer,
    };
  } catch (e) {
    throw new Error(`The seal certificate cannot be opened: wrong passphrase or an unsupported file (${String((e as Error)?.message ?? e).slice(0, 120)})`);
  }
}

const name = (cn: string, org?: string) => {
  const n = new pkijs.RelativeDistinguishedNames();
  const add = (type: string, v: string, printable = false) => n.typesAndValues.push(new pkijs.AttributeTypeAndValue({ type, value: printable ? new asn1js.PrintableString({ value: v }) : new asn1js.Utf8String({ value: v }) }));
  add(OID_CN, cn);
  if (org) add(OID_O, org);
  add(OID_C, "ES", true);
  // one SET per attribute (the usual shape of a name); pkijs would put them all in a single SET
  n.valueBeforeDecode = new asn1js.Sequence({ value: n.typesAndValues.map((t) => new asn1js.Set({ value: [t.toSchema()] })) }).toBER(false);
  return n;
};

/** A new self-signed certificate and key (RSA 2048, SHA-256), the key encrypted with the passphrase. */
export function generateSelfSigned(o: { commonName: string; organization?: string; years?: number; passphrase: string; now?: Date }): SealCredentials {
  const now = o.now ?? new Date();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sha256WithRsa = () => new pkijs.AlgorithmIdentifier({ algorithmId: "1.2.840.113549.1.1.11", algorithmParams: new asn1js.Null() });
  const cert = new pkijs.Certificate();
  cert.version = 2;
  cert.serialNumber = new asn1js.Integer({ valueHex: Buffer.concat([Buffer.from([0x01]), randomBytes(8)]) });
  cert.subject = name(o.commonName, o.organization);
  cert.issuer = name(o.commonName, o.organization);
  cert.notBefore.value = new Date(now.getTime() - 60_000);
  cert.notAfter.value = new Date(now.getTime() + (o.years ?? 3) * 365.25 * 86_400_000);
  const spki = asn1js.fromBER(new Uint8Array(publicKey.export({ type: "spki", format: "der" })).buffer as ArrayBuffer);
  cert.subjectPublicKeyInfo = new pkijs.PublicKeyInfo({ schema: spki.result });
  cert.extensions = [
    new pkijs.Extension({ extnID: "2.5.29.19", critical: true, extnValue: new pkijs.BasicConstraints({ cA: false }).toSchema().toBER(false) }),
    // digitalSignature (bit 0) and nonRepudiation (bit 1)
    new pkijs.Extension({ extnID: "2.5.29.15", critical: true, extnValue: new asn1js.BitString({ valueHex: new Uint8Array([0xc0]).buffer, unusedBits: 6 }).toBER(false) }),
  ];
  cert.signature = sha256WithRsa();
  cert.signatureAlgorithm = sha256WithRsa();
  // signed with Node's synchronous RSA, so callers (startup, tests) stay synchronous
  const signature = createSign("sha256").update(Buffer.from(cert.encodeTBS().toBER(false))).sign(privateKey);
  cert.signatureValue = new asn1js.BitString({ valueHex: new Uint8Array(signature).buffer as ArrayBuffer });
  const der = Buffer.from(cert.toSchema(true).toBER(false));
  const certPem = `-----BEGIN CERTIFICATE-----\n${der.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`;
  const keyPem = privateKey.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: o.passphrase }) as string;
  return { certPem, keyPem, passphrase: o.passphrase, ...describeSeal(certPem, keyPem, o.passphrase) };
}

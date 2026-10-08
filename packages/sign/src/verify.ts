// Checks the digital signature of a sealed PDF WITHOUT the signing library: reads the byte range and the CMS blob by hand and verifies
// the signature with node-forge. Used by the tests (so signing and checking can never share a mistake) and for "is this file still
// exactly what was sealed?". It reports whether the signature is mathematically valid and whether it covers the WHOLE file; it does not
// decide whether the certificate is trusted (a self-signed one never is).
import { createHash } from "node:crypto";
import forge from "node-forge";

export type SealCheck = { signed: boolean; valid: boolean; coversWholeFile: boolean; signerName: string | null; reason?: string };

const fail = (reason: string, over: Partial<SealCheck> = {}): SealCheck => ({ signed: true, valid: false, coversWholeFile: false, signerName: null, reason, ...over });

export function verifySeal(pdf: Buffer): SealCheck {
  const text = pdf.toString("latin1");
  const ranges = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
  if (!ranges.length) return { signed: false, valid: false, coversWholeFile: false, signerName: null, reason: "no signature" };
  const [, a, b, c, d] = ranges[ranges.length - 1].map(Number);
  if (a !== 0 || b + 0 > pdf.length || c + d > pdf.length || c < b) return fail("the byte range is not valid");
  const coversWholeFile = c + d === pdf.length;

  const gap = text.slice(b, c); // "<hex...>" including the angle brackets
  const hex = /^<([0-9a-fA-F]+)>$/.exec(gap)?.[1];
  if (!hex) return fail("the signature contents are not where the byte range says", { coversWholeFile });
  try {
    const der = Buffer.from(hex, "hex");
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString("binary")), { parseAllBytes: false } as unknown as boolean); // the options object is supported at run time but missing from the type definitions: the reserved space after the signature is padding
    const p7 = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData & { rawCapture: Record<string, unknown> };
    const cert = (p7.certificates ?? [])[0] as forge.pki.Certificate | undefined;
    if (!cert) return fail("no certificate in the signature", { coversWholeFile });
    const raw = p7.rawCapture as { authenticatedAttributes?: forge.asn1.Asn1[]; signature?: string; digestAlgorithm?: string };
    if (!raw.authenticatedAttributes || !raw.signature) return fail("the signature has no signed attributes", { coversWholeFile });

    // 1. the message digest inside the signature must be the SHA-256 of exactly the bytes the byte range covers
    const signedBytes = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);
    const digest = createHash("sha256").update(signedBytes).digest();
    const attr = raw.authenticatedAttributes.find((x) => forge.asn1.derToOid((x.value as forge.asn1.Asn1[])[0].value as string) === forge.pki.oids.messageDigest);
    const stored = attr ? ((((attr.value as forge.asn1.Asn1[])[1].value as forge.asn1.Asn1[])[0].value as string) ?? "") : "";
    if (Buffer.from(stored, "binary").compare(digest) !== 0) return fail("the document was changed after it was sealed", { coversWholeFile, signerName: cert.subject.getField("CN")?.value ?? null });

    // 2. the signature over the signed attributes must verify with the certificate's public key
    const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, raw.authenticatedAttributes);
    const md = forge.md.sha256.create();
    md.update(forge.asn1.toDer(set).getBytes());
    const ok = (cert.publicKey as forge.pki.rsa.PublicKey).verify(md.digest().getBytes(), raw.signature);
    return { signed: true, valid: ok, coversWholeFile, signerName: cert.subject.getField("CN")?.value ?? null, reason: ok ? undefined : "the signature does not match the certificate" };
  } catch (e) {
    return fail(`the signature could not be read (${String((e as Error)?.message ?? e).slice(0, 100)})`, { coversWholeFile });
  }
}

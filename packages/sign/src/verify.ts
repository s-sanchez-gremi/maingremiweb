// Checks the digital signature of a sealed PDF WITHOUT the signing library: reads the byte range and the CMS blob by hand (pkijs) and verifies
// the signature with node-forge. Used by the tests (so signing and checking can never share a mistake) and for "is this file still
// exactly what was sealed?". It reports whether the signature is mathematically valid and whether it covers the WHOLE file; it does not
// decide whether the certificate is trusted (a self-signed one never is).
import { X509Certificate, createHash, createVerify } from "node:crypto";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

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
    const parsed = asn1js.fromBER(new Uint8Array(der).buffer as ArrayBuffer); // the reserved space after the signature is zero padding: only the first element counts
    if (parsed.offset === -1) return fail("the signature could not be read", { coversWholeFile });
    const sd = new pkijs.SignedData({ schema: new pkijs.ContentInfo({ schema: parsed.result }).content });
    const cert = sd.certificates?.[0] as pkijs.Certificate | undefined;
    const si = sd.signerInfos[0];
    if (!cert) return fail("no certificate in the signature", { coversWholeFile });
    const signerName = (cert.subject.typesAndValues.find((t) => t.type === "2.5.4.3")?.value.valueBlock as { value?: string } | undefined)?.value ?? null;
    if (!si?.signedAttrs || !si.signature) return fail("the signature has no signed attributes", { coversWholeFile });

    // 1. the message digest inside the signature must be the SHA-256 of exactly the bytes the byte range covers
    const signedBytes = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);
    const digest = createHash("sha256").update(signedBytes).digest();
    const attr = si.signedAttrs.attributes.find((x) => x.type === "1.2.840.113549.1.9.4");
    const stored = attr ? Buffer.from((attr.values[0] as asn1js.OctetString).valueBlock.valueHexView) : Buffer.alloc(0);
    if (stored.compare(digest) !== 0) return fail("the document was changed after it was sealed", { coversWholeFile, signerName });

    // 2. the signature over the signed attributes (re-tagged from [0] to SET, as the standard says) must verify with the certificate's public key
    const attrs = Buffer.from(si.signedAttrs.encodedValue);
    attrs[0] = 0x31;
    const key = new X509Certificate(Buffer.from(cert.toSchema(true).toBER(false))).publicKey;
    const ok = createVerify("sha256").update(attrs).verify(key, Buffer.from(si.signature.valueBlock.valueHexView));
    return { signed: true, valid: ok, coversWholeFile, signerName, reason: ok ? undefined : "the signature does not match the certificate" };
  } catch (e) {
    return fail(`the signature could not be read (${String((e as Error)?.message ?? e).slice(0, 100)})`, { coversWholeFile });
  }
}

// Builds the digital signature (CMS SignedData, detached, SHA-256, RSA) for the signature library, from a PEM certificate and an encrypted
// PEM key. Replaces the p12 signer of @signpdf, which needs node-forge (a library with an open advisory and no fix).
import { createHash, createPrivateKey, webcrypto } from "node:crypto";
import { Signer } from "@signpdf/utils";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

pkijs.setEngine("node", new pkijs.CryptoEngine({ name: "node", crypto: webcrypto as unknown as Crypto, subtle: webcrypto.subtle as unknown as SubtleCrypto }));

const pemToDer = (pem: string) => Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
const certsOf = (pem: string) => (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map((p) => pkijs.Certificate.fromBER(pemToDer(p)));

export class PemSigner extends Signer {
  constructor(private certPem: string, private keyPem: string, private passphrase: string) { super(); }

  async sign(pdfBuffer: Buffer, signingTime?: Date): Promise<Buffer> {
    const certs = certsOf(this.certPem);
    if (!certs.length) throw new Error("no certificate");
    const key = await webcrypto.subtle.importKey("pkcs8", createPrivateKey({ key: this.keyPem, format: "pem", passphrase: this.passphrase }).export({ type: "pkcs8", format: "der" }), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signed = new pkijs.SignedData({
      version: 1,
      encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: "1.2.840.113549.1.7.1" }), // no content: the signature is detached
      signerInfos: [new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({ issuer: certs[0].issuer, serialNumber: certs[0].serialNumber }),
      })],
      certificates: certs,
    });
    signed.signerInfos[0].signedAttrs = new pkijs.SignedAndUnsignedAttributes({
      type: 0,
      attributes: [
        new pkijs.Attribute({ type: "1.2.840.113549.1.9.3", values: [new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" })] }),
        new pkijs.Attribute({ type: "1.2.840.113549.1.9.5", values: [new asn1js.UTCTime({ valueDate: signingTime ?? new Date() })] }),
        new pkijs.Attribute({ type: "1.2.840.113549.1.9.4", values: [new asn1js.OctetString({ valueHex: new Uint8Array(createHash("sha256").update(pdfBuffer).digest()).buffer as ArrayBuffer })] }),
      ],
    });
    await signed.sign(key, 0, "SHA-256"); // signs the attributes, which carry the document's digest
    const info = new pkijs.ContentInfo({ contentType: "1.2.840.113549.1.7.2", content: signed.toSchema(true) });
    return Buffer.from(info.toSchema().toBER(false));
  }
}

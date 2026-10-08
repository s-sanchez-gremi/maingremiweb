// Makes the certificate that seals finished documents, for the day this app runs on a real server.
//
//   pnpm --filter sign seal:generate [--name "Gremi de Editors"] [--org "Gremi"] [--years 3] [--out seal]
//
// Prints the three lines to put in the server's environment (SIGN_SEAL_CERT, SIGN_SEAL_KEY, SIGN_SEAL_PASSPHRASE). Nothing is stored anywhere unless
// --out is given (then seal.crt.pem and seal.key.pem are written there too: keep it out of git and out of the repository folder).
//
// This is a SELF-SIGNED certificate: it proves a sealed document has not changed since it was sealed (any edit breaks the signature),
// not who sealed it, so Acrobat will say "validity unknown". A certificate bought from a recognised authority (an organisation
// certificate) goes into the same two variables with no other change. Renewing the certificate never affects documents already sealed.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { generateSelfSigned } from "@apex/sign/cert";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };

const years = Number(arg("years", "3"));
if (!Number.isFinite(years) || years < 1 || years > 10) { console.error("--years must be between 1 and 10"); process.exit(1); }
const passphrase = randomBytes(18).toString("base64url");
const c = generateSelfSigned({ commonName: arg("name", "Apex Signatures"), organization: arg("org", "") || undefined, years, passphrase });

console.log(`Seal certificate made: "${c.commonName}", valid until ${c.notAfter.toISOString().slice(0, 10)}, SHA-256 ${c.fingerprint}\n`);
console.log("Put these two lines in the server's environment (and nowhere else; the passphrase is shown only now):\n");
console.log(`SIGN_SEAL_CERT=${Buffer.from(c.certPem).toString("base64")}`);
console.log(`SIGN_SEAL_KEY=${Buffer.from(c.keyPem).toString("base64")}`);
console.log(`SIGN_SEAL_PASSPHRASE=${passphrase}\n`);
const out = arg("out", "");
if (out) { writeFileSync(`${out}.crt.pem`, c.certPem); writeFileSync(`${out}.key.pem`, c.keyPem, { mode: 0o600 }); console.log(`The files were also written to ${out}.crt.pem and ${out}.key.pem. Keep them out of git.`); }

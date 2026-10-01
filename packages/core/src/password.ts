// Pure password helpers (no Next.js imports) so they can be used and tested anywhere.
import { hash, verify } from "@node-rs/argon2";

export const MIN_PASSWORD = 12;
export const hashPassword = (pw: string) => hash(pw); // argon2id by default
export const verifyPassword = (hashed: string, pw: string) => verify(hashed, pw);

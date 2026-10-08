// Pure password helpers (no Next.js imports) so they can be used and tested anywhere.
import { hash, verify } from "@node-rs/argon2";

export const MIN_PASSWORD = 12;
export const hashPassword = (pw: string) => hash(pw); // argon2id by default
export const verifyPassword = (hashed: string, pw: string) => verify(hashed, pw);

/** Login check that costs the same whether the account exists or not (no hash = hash the attempt and refuse), so response time never reveals which emails are registered. */
export async function checkPassword(hashed: string | null | undefined, pw: string): Promise<boolean> {
  if (!hashed) { await hashPassword(pw); return false; }
  return verifyPassword(hashed, pw);
}

// Where the links in emails point. SIGN_URL is the Signatures app's public address (one host: the staff screens are locked at the proxy,
// the signer pages under /sign are open to everyone).
export const publicBase = () => (process.env.SIGN_URL ?? "http://localhost:3004").replace(/\/+$/, "");
export const signLink = (token: string) => `${publicBase()}/sign/${token}`;
export const staffLink = (requestId: string) => `${publicBase()}/admin/requests/${requestId}`;

// Webhooks: a form tells another system when a response is sent or changed.
//  - Deliveries are rows written in the SAME transaction as the response (so a crash never loses one) and sent afterwards with retries,
//    exactly like the email outbox: claimed with SKIP LOCKED, exponential backoff, "dead" after 8 attempts and visible to staff.
//  - Every request is signed (HMAC-SHA256 of "<timestamp>.<body>" with the endpoint's secret) so the receiver can check it came from here.
//  - A staff-typed address is the one place this server makes requests to a destination it does not control, so SSRF is defended in depth:
//    https only, no credentials, and the address is checked AT CONNECTION TIME (a name that resolves to a private, loopback, link-local or
//    metadata address is refused, so DNS tricks cannot slip past a check made earlier), redirects are never followed, short timeouts, small bodies.
import { createHmac, randomBytes } from "node:crypto";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { and, desc, eq, inArray, lt, lte } from "drizzle-orm";
import { db } from "@apex/db";
import { formWebhooks, webhookDeliveries, type Answer } from "@apex/db/schema";
import { answerText } from "./answer-text";

// ---- which addresses may be called ---------------------------------------------------------------------------------------
const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["64:ff9b::", 96], ["100::", 64],
  ["2002::", 16], ["2001::", 32], // ::/96 covers :: , ::1 and the old IPv4-compatible form; 6to4 and Teredo can hide a private IPv4 address
] as const) blocked.addSubnet(net, bits, "ipv6");

/** An IPv6 address as its 8 groups (handles "::" and a trailing dotted IPv4), or null. */
function groups(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (dotted) { const [a, b, c, d] = dotted.slice(1).map(Number); if ([a, b, c, d].some((n) => n > 255)) return null; s = s.slice(0, dotted.index) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16); }
  const [head, tail, extra] = s.split("::");
  if (extra !== undefined) return null;
  const h = head ? head.split(":") : [], t = tail === undefined ? [] : tail ? tail.split(":") : [];
  if (tail === undefined ? h.length !== 8 : h.length + t.length > 7) return null;
  const all = tail === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  const nums = all.map((x) => parseInt(x, 16));
  return nums.length === 8 && nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? nums : null;
}

/** Only addresses of the public internet. An IPv4 address written inside IPv6 (`::ffff:a.b.c.d` or `::ffff:a00:1`) is judged by the IPv4 address inside it. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (!family) return false;
  if (family === 6) {
    const g = groups(ip);
    if (!g) return false;
    if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) return isPublicAddress(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  return !blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/** Local development and the test suite may call this machine; a real environment never may (the startup check refuses the variable there). */
export const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE === "1" && !["staging", "production"].includes(process.env.APP_ENV ?? "");

const INTERNAL_NAME = /(^|\.)(localhost|local|internal|lan|intranet|home|corp)$/i;
export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/** The address a person typed as an endpoint. This is the first line of defence (the connection check is the one that cannot be tricked). */
export function checkWebhookUrl(raw: string, priv = allowPrivate()): UrlCheck {
  const s = raw.trim();
  if (!s) return { ok: false, reason: "Indica l'adreça de l'endpoint" };
  if (s.length > 500 || /\s/.test(s)) return { ok: false, reason: "L'adreça no és vàlida" };
  let u: URL;
  try { u = new URL(s); } catch { return { ok: false, reason: "L'adreça no és vàlida" }; }
  if (u.protocol !== "https:" && !(priv && u.protocol === "http:")) return { ok: false, reason: "L'adreça ha de començar per https://" };
  if (u.username || u.password) return { ok: false, reason: "L'adreça no pot portar usuari ni contrasenya" };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, reason: "L'adreça no és vàlida" };
  if (!priv) {
    if (isIP(host) ? !isPublicAddress(host) : INTERNAL_NAME.test(host) || !host.includes(".")) return { ok: false, reason: "L'adreça ha de ser d'un servidor públic d'Internet (no pot apuntar a una xarxa interna)" };
  }
  u.hash = "";
  return { ok: true, url: u.toString() };
}

/** DNS lookup that refuses to hand out anything but public addresses: the connection is made to an address that was checked a moment ago, not to one resolved again later. */
export const guardedLookup = ((hostname: string, options: dns.LookupOptions, cb: (err: Error | null, address: string | dns.LookupAddress[], family?: number) => void) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "", 0);
    const list = addresses as dns.LookupAddress[];
    if (!allowPrivate() && (list.length === 0 || list.some((a) => !isPublicAddress(a.address)))) return cb(new Error("address not allowed"), "", 0);
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}) as unknown as http.RequestOptions["lookup"];

export type PostResult = { status: number; body: string };
const MAX_BODY = 256 * 1024;

/** One signed POST. Never follows redirects, gives up after `timeoutMs` in total, keeps only the first bytes of the answer. */
export function postJson(url: string, body: string, headers: Record<string, string>, timeoutMs = 8000): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    if (Buffer.byteLength(body) > MAX_BODY) return reject(new Error("payload too large"));
    const check = checkWebhookUrl(url);
    if (!check.ok) return reject(new Error(check.reason));
    const u = new URL(check.url);
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const req = (u.protocol === "https:" ? https : http).request({
      protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ""), port: u.port || undefined, path: u.pathname + u.search, method: "POST", agent: false, lookup: guardedLookup,
      headers: { ...headers, "content-type": "application/json", "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => { size += c.length; if (size <= 2048) chunks.push(c); else res.destroy(); });
      const done = () => finish(() => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8").slice(0, 500) }));
      res.on("end", done);
      res.on("close", done);
      res.on("error", done);
    });
    const timer = setTimeout(() => { req.destroy(new Error("timeout")); finish(() => reject(new Error("timeout"))); }, timeoutMs);
    req.on("error", (e) => finish(() => reject(e)));
    req.end(body);
  });
}

// ---- signing and payloads -------------------------------------------------------------------------------------------------
export const newWebhookSecret = () => `whsec_${randomBytes(32).toString("base64url")}`;

/** The header the receiver checks: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`. Reject it when `t` is more than a few minutes old. */
export function sign(secret: string, body: string, at = Math.floor(Date.now() / 1000)): string {
  return `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${body}`).digest("hex")}`;
}

export type WebhookEvent = "response.created" | "response.updated" | "ping";
export type ResponseInfo = {
  id: string; createdAt: Date; locale: string; sourcePath: string; theme: string; utm: Record<string, string>; answers: Answer[];
  changes?: { label: string; was: string; now: string }[]; editCount?: number;
  byStaff?: boolean; // the change was made by staff (a card moved on the board), not by the respondent
};
type FormInfo = { id: string; slug: string; name: string };

/** What the receiver gets. Files are named, never included (and never with their storage key). */
export function buildPayload(event: WebhookEvent, form: FormInfo, r: ResponseInfo | null): Record<string, unknown> {
  return {
    event,
    form: { id: form.id, slug: form.slug, name: form.name },
    response: r && {
      id: r.id, createdAt: r.createdAt.toISOString(), locale: r.locale, sourcePath: r.sourcePath, theme: r.theme, utm: r.utm,
      answers: r.answers.map((a) => ({ id: a.id, label: a.label, type: a.type, value: a.type === "file" ? { name: (a.value as { name?: string } | null)?.name ?? "" } : a.value, text: answerText(a) })),
      ...(r.changes ? { changes: r.changes, editCount: r.editCount, changedBy: r.byStaff ? "staff" : "respondent" } : {}),
    },
  };
}

// ---- queue ----------------------------------------------------------------------------------------------------------------
const MAX_ATTEMPTS = 8;
const BACKOFF_MIN = [1, 5, 15, 60, 180, 360, 720, 1440]; // minutes before attempt n+1
const CLAIM_MS = 3 * 60 * 1000;                           // a worker that dies mid-send: the row is retried after this
const KEEP_DAYS = 30;
type Tx = Pick<typeof db, "select" | "insert">;

/** Queues the event for every enabled endpoint of the form (call it inside the transaction that stores the response). */
export async function enqueueWebhooks(tx: Tx, form: FormInfo, event: WebhookEvent, response: ResponseInfo): Promise<number> {
  const hooks = await tx.select({ id: formWebhooks.id }).from(formWebhooks).where(and(eq(formWebhooks.formId, form.id), eq(formWebhooks.enabled, true)));
  if (!hooks.length) return 0;
  const payload = buildPayload(event, form, response);
  await tx.insert(webhookDeliveries).values(hooks.map((h) => ({ webhookId: h.id, submissionId: response.id, event, payload, runAfter: new Date() })));
  return hooks.length;
}

type Post = typeof postJson;
export async function processWebhooks(opts: { limit?: number; now?: Date; post?: Post } = {}): Promise<{ sent: number; failed: number }> {
  const now = opts.now ?? new Date(), post = opts.post ?? postJson;
  const claimed = await db.transaction(async (tx) => {
    const due = await tx.select({ id: webhookDeliveries.id }).from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.runAfter, now))).orderBy(webhookDeliveries.createdAt).limit(opts.limit ?? 20).for("update", { skipLocked: true });
    if (!due.length) return [];
    return tx.update(webhookDeliveries).set({ runAfter: new Date(now.getTime() + CLAIM_MS) }).where(inArray(webhookDeliveries.id, due.map((d) => d.id))).returning();
  });
  let sent = 0, failed = 0;
  const one = async (row: (typeof claimed)[number]) => {
    const [hook] = await db.select().from(formWebhooks).where(eq(formWebhooks.id, row.webhookId));
    if (!hook || !hook.enabled) {
      await db.update(webhookDeliveries).set({ status: "dead", lastError: "Integració desactivada o eliminada" }).where(eq(webhookDeliveries.id, row.id));
      failed++; return;
    }
    const body = JSON.stringify({ ...row.payload, delivery: row.id }); // the same id on every retry, so the receiver can ignore duplicates
    try {
      const res = await post(hook.url, body, { "user-agent": "ApexForms-Webhook/1", "x-apex-event": row.event, "x-apex-delivery": row.id, "x-apex-signature": sign(hook.secret, body) });
      if (res.status >= 200 && res.status < 300) {
        await db.update(webhookDeliveries).set({ status: "sent", sentAt: new Date(), attempts: row.attempts + 1, lastStatus: res.status, lastError: null }).where(eq(webhookDeliveries.id, row.id));
        sent++; return;
      }
      throw Object.assign(new Error(res.status >= 300 && res.status < 400 ? `L'endpoint ha respost amb una redirecció (${res.status}), que no se segueix` : `L'endpoint ha respost ${res.status}${res.body ? `: ${res.body}` : ""}`), { status: res.status });
    } catch (e) {
      const attempts = row.attempts + 1, dead = attempts >= MAX_ATTEMPTS;
      await db.update(webhookDeliveries).set({
        status: dead ? "dead" : "pending", attempts, lastStatus: (e as { status?: number }).status ?? null, lastError: String((e as Error)?.message ?? e).slice(0, 500),
        runAfter: new Date(now.getTime() + (BACKOFF_MIN[attempts - 1] ?? 1440) * 60_000),
      }).where(eq(webhookDeliveries.id, row.id));
      failed++;
    }
  };
  for (let i = 0; i < claimed.length; i += 5) await Promise.all(claimed.slice(i, i + 5).map(one)); // a few at a time: one slow endpoint cannot hold up the others
  return { sent, failed };
}

/** Staff: try again now (a dead delivery, or one waiting for its next attempt). */
export async function retryDelivery(id: string): Promise<void> {
  await db.update(webhookDeliveries).set({ status: "pending", attempts: 0, runAfter: new Date() }).where(and(eq(webhookDeliveries.id, id), inArray(webhookDeliveries.status, ["pending", "dead"])));
}

/** Staff: send a harmless sample event to see the endpoint work (shows in the delivery list like any other). */
// runAfter is set from the app's own clock (not the database default): the scheduler compares it with the app's clock, and a database clock a hair ahead made a brand-new delivery wait for the next run.
export async function queuePing(form: FormInfo, webhookId: string): Promise<string> {
  const [row] = await db.insert(webhookDeliveries).values({ webhookId, event: "ping", payload: buildPayload("ping", form, null), runAfter: new Date() }).returning({ id: webhookDeliveries.id });
  return row.id;
}

/** Scheduler: delivered and given-up deliveries are kept for 30 days (they hold response data), then deleted. */
export async function purgeWebhookDeliveries(now = new Date()): Promise<number> {
  const gone = await db.delete(webhookDeliveries).where(and(inArray(webhookDeliveries.status, ["sent", "dead"]), lt(webhookDeliveries.createdAt, new Date(now.getTime() - KEEP_DAYS * 86_400_000)))).returning({ id: webhookDeliveries.id });
  return gone.length;
}

export const listWebhooks = (formId: string) => db.select().from(formWebhooks).where(eq(formWebhooks.formId, formId)).orderBy(formWebhooks.createdAt);
export async function recentDeliveries(formId: string, limit = 30) {
  return db.select({ d: webhookDeliveries, url: formWebhooks.url }).from(webhookDeliveries).innerJoin(formWebhooks, eq(formWebhooks.id, webhookDeliveries.webhookId))
    .where(eq(formWebhooks.formId, formId)).orderBy(desc(webhookDeliveries.createdAt)).limit(limit);
}

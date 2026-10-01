import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; text: string };
export type Transport = { sendMail: (m: { from: string; to: string; subject: string; text: string }) => Promise<unknown> };

const g = globalThis as unknown as { __mail?: Transport };
const transport = (): Transport => (g.__mail ??= nodemailer.createTransport(process.env.SMTP_URL ?? "smtp://localhost:1025") as unknown as Transport);

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim(); // no header injection

/** Sends one plain-text email. Throws on failure (the outbox retries). */
export async function sendMail(m: Mail, t: Transport = transport()) {
  await t.sendMail({ from: process.env.MAIL_FROM ?? "Apex <no-reply@apex.example>", to: clean(m.to), subject: clean(m.subject).slice(0, 200), text: m.text });
}

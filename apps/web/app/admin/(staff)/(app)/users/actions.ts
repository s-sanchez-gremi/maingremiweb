"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@apex/core/auth";
import { UserError, createUser, deleteUser, resetPassword, setRole } from "@apex/core/users";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const role = z.enum(["admin", "editor"]);
const uuid = z.string().uuid();

async function run(fn: () => Promise<void>, ok: string) {
  try { await fn(); }
  catch (e) { if (e instanceof UserError) redirect("/admin/users?error=" + encodeURIComponent(e.message)); throw e; }
  redirect("/admin/users?ok=" + encodeURIComponent(ok));
}

export async function addUser(fd: FormData) {
  await requireUser("users:manage");
  await run(async () => { await createUser({ email: s(fd, "email"), name: s(fd, "name"), role: role.parse(s(fd, "role")), password: s(fd, "password") }); }, "Usuari creat.");
}

export async function changeRole(fd: FormData) {
  const me = await requireUser("users:manage");
  await run(() => setRole(me.id, uuid.parse(s(fd, "id")), role.parse(s(fd, "role"))), "Rol actualitzat.");
}

export async function adminResetPassword(fd: FormData) {
  await requireUser("users:manage");
  await run(() => resetPassword(uuid.parse(s(fd, "id")), s(fd, "password")), "Contrasenya restablerta. L'usuari haurà d'entrar de nou.");
}

export async function removeUser(fd: FormData) {
  const me = await requireUser("users:manage");
  await run(() => deleteUser(me.id, uuid.parse(s(fd, "id"))), "Usuari eliminat.");
}

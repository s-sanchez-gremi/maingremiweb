import { redirect } from "next/navigation";
import { destroySession, requireUser } from "@/lib/auth";

async function logout() {
  "use server";
  await destroySession();
  redirect("/admin/login");
}

export default async function AdminHome() {
  const user = await requireUser();
  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1 style={{ fontFamily: "Georgia, serif" }}>Tauler</h1>
      <p>Sessió: {user.email} ({user.role})</p>
      <form action={logout}><button type="submit">Surt</button></form>
    </main>
  );
}

import { revalidatePath } from "next/cache";
import { revalidateContent } from "@/lib/cache";
import { asc } from "drizzle-orm";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { categories } from "@apex/db/schema";
import { slugify } from "@apex/core/slug";

async function addCategory(formData: FormData) {
  "use server";
  await requireUser("categories:write");
  const names = { ca: String(formData.get("ca") ?? "").trim(), es: String(formData.get("es") ?? "").trim(), en: String(formData.get("en") ?? "").trim() };
  const slug = slugify(names.ca);
  if (!slug) return;
  await db.insert(categories).values({ slug, names }).onConflictDoNothing();
  revalidatePath("/admin/categories");
  await revalidateContent();
}

export default async function Categories() {
  const rows = await db.select().from(categories).orderBy(asc(categories.slug));
  return (
    <>
      <div className="top"><h1>Categories</h1></div>
      <div className="body">
        <div className="cols">
          <div className="col-main">
            <table>
              <thead><tr><th>CA</th><th>ES</th><th>EN</th></tr></thead>
              <tbody>{rows.map((c) => <tr key={c.id}><td>{c.names.ca}</td><td>{c.names.es}</td><td>{c.names.en}</td></tr>)}</tbody>
            </table>
            {rows.length === 0 && <p className="hint">Encara no hi ha categories.</p>}
          </div>
          <form action={addCategory} className="card col-side">
            <h3>Nova categoria</h3>
            <label>Català (obligatori)<input name="ca" required /></label>
            <label>Castellà<input name="es" /></label>
            <label>Anglès<input name="en" /></label>
            <button className="btn primary" type="submit">Afegeix</button>
          </form>
        </div>
      </div>
    </>
  );
}

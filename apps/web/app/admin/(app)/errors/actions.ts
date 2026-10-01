"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@apex/db";
import { requireUser } from "@/lib/auth";
import { errorLog } from "@apex/db/schema";

export async function resolveError(fd: FormData) {
  await requireUser("settings:write"); // admins only
  await db.update(errorLog).set({ resolved: true }).where(eq(errorLog.id, z.coerce.number().int().parse(fd.get("id"))));
  revalidatePath("/admin/errors");
}

// Same guarded download as the admin one (session + permission + file belongs to this record + 60-second link).
export { GET } from "@/app/admin/(app)/erp/[entity]/[id]/files/[fileId]/route";
export const dynamic = "force-dynamic";

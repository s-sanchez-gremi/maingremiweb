// The single place that decides who may do what. Two roles only.
export type Role = "admin" | "editor";
export type Action =
  | "content:write" | "content:publish" | "media:write"
  | "forms:write" | "categories:write" | "projects:write"
  | "users:manage" | "settings:write" | "data:erase";

const editorActions: Action[] = ["content:write", "content:publish", "media:write", "forms:write", "categories:write", "projects:write"];

export function can(user: { role: Role } | null | undefined, action: Action): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return editorActions.includes(action);
}

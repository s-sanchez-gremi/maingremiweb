import { notFound } from "next/navigation";

// Anything deeper than a known route: a proper, localized 404.
export default function CatchAll() {
  notFound();
}

"use client";
// A filter menu that applies itself: choosing a value submits the surrounding form (no "Filtra" button to hunt for).
import type { SelectHTMLAttributes } from "react";

export function AutoSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

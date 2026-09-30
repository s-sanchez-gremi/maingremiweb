"use client";
import type { ButtonHTMLAttributes } from "react";

/** A submit button that asks "are you sure?" first. (Server-rendered pages can't carry click handlers themselves.) */
export function ConfirmButton({ message, ...rest }: { message: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="submit" {...rest} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }} />;
}

import type { ButtonHTMLAttributes } from "react";

export type Variant = "primary" | "outline" | "light";
/** Class names for anything that must look like a button (links use this with <a>/<Link>). */
export const btnClass = (variant: Variant = "outline") => `btn${variant === "outline" ? "" : ` ${variant}`}`;

export function Button({ variant = "outline", className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={[btnClass(variant), className].filter(Boolean).join(" ")} {...rest} />;
}

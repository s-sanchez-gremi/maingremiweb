"use client";
// Collapses the sidebar to an icon rail (more room for the table). The choice is remembered in a first-party cookie the server reads, so the page never flashes.
import { Icon } from "./icons";

export function SidebarToggle() {
  return (
    <button
      type="button" className="ws-collapse" aria-label="Plega o desplega el menú lateral" title="Plega o desplega el menú"
      onClick={() => {
        const shell = document.querySelector<HTMLElement>(".ws-shell");
        if (!shell) return;
        const on = shell.toggleAttribute("data-collapsed");
        document.cookie = `ws_nav=${on ? "c" : "e"}; path=/workspace; max-age=31536000; samesite=lax`;
      }}
    >
      <Icon name="sidebar" size={16} />
    </button>
  );
}

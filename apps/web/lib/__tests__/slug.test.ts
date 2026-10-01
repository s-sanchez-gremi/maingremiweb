import { expect, it } from "vitest";
import { slugify } from "@apex/core/slug";

it("makes clean URL slugs", () => {
  expect(slugify("El GREMI visita Rovellosa Packaging & Labels")).toBe("el-gremi-visita-rovellosa-packaging-labels");
  expect(slugify("Formació: intel·ligència artificial")).toBe("formacio-intelligencia-artificial");
  expect(slugify("  --¡Hola!--  ")).toBe("hola");
});

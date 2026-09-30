// Everything about a form except its field list, in the same field language as sections (form + validation are generated).
import { z } from "zod";
import { shape, type Field } from "@/sections/fields";

const yesNo = [{ value: "no", label: "No" }, { value: "yes", label: "Sí" }];

export const formSettingsFields: Field[] = [
  { name: "title", label: "Títol públic del formulari", kind: "ltext" },
  { name: "confirmation", label: "Missatge que veu la persona en enviar-lo", kind: "ltextarea" },
  { name: "consent", label: "Text de consentiment (l'ha d'acceptar; es desa tal qual amb la data). Admet [text](enllaç).", kind: "ltextarea" },
  { name: "newsletterEnabled", label: "Ofereix la subscripció al butlletí (casella a part, sense marcar)", kind: "select", options: yesNo },
  { name: "newsletterText", label: "Text de la casella del butlletí", kind: "ltext" },
  { name: "staffEmail", label: "Avisa l'equip per correu", kind: "select", options: yesNo },
  { name: "staffAddresses", label: "Adreces de l'equip (separades per comes)", kind: "text" },
  { name: "confirmToSender", label: "Envia una confirmació a qui l'omple", kind: "select", options: yesNo },
  { name: "confirmSubject", label: "Assumpte de la confirmació", kind: "ltext" },
  { name: "confirmBody", label: "Text de la confirmació", kind: "ltextarea" },
];
export const formSettingsSchema = z.object(shape(formSettingsFields)) as unknown as z.ZodType<FormSettings>;

type LText = { ca: string; es: string; en: string };
export type FormSettings = {
  title: LText; confirmation: LText; consent: LText; newsletterEnabled: "yes" | "no"; newsletterText: LText;
  staffEmail: "yes" | "no"; staffAddresses: string; confirmToSender: "yes" | "no"; confirmSubject: LText; confirmBody: LText;
};

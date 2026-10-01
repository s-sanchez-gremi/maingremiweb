"use client";
// Connects the form (a shared component that knows nothing about cookies) to the site's cookie consent:
// remembered campaign tags are used only when the visitor allowed "Campaign source".
import { FormRenderer, type Source } from "@apex/forms/components/FormRenderer";
import type { PublicForm } from "@apex/forms/public-form";
import type { Locale } from "@apex/db/schema";
import { storedUtm, useConsent } from "../consent/store";

export function ConsentAwareForm(props: { form: PublicForm; locale: Locale; source: Source }) {
  const consent = useConsent();
  return <FormRenderer {...props} campaign={() => (consent?.attribution ? { ...storedUtm() } : {})} />;
}

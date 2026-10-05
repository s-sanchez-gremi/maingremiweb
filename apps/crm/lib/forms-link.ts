// The form builder and the responses live in the Forms app (its own address, FORMS_URL). Links from the CRM go there.
// Without FORMS_URL (not configured) the link stays relative and simply will not resolve: set it in every environment.
export const formsHref = (path: string) => `${(process.env.FORMS_URL ?? "").replace(/\/$/, "")}${path}`;

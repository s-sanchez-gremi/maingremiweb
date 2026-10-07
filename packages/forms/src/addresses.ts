// Staff notification addresses typed into a form's settings: separated by commas, semicolons or spaces; only plausible ones, once each, in lower case.
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
export const parseAddresses = (s: string | undefined) => [...new Set((s ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => EMAIL.test(x)))];

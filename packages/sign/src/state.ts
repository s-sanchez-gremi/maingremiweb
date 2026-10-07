// The life of a signature request. One table of allowed moves; every screen and every job asks it, nothing else decides.
export type RequestStatus = "draft" | "sent" | "completed" | "declined" | "expired" | "voided";

const NEXT: Record<RequestStatus, RequestStatus[]> = {
  draft: ["sent"],                                   // a draft that is not wanted is deleted, not "voided"
  sent: ["completed", "declined", "expired", "voided"],
  completed: [],
  declined: [],
  expired: [],
  voided: [],
};

export const canTransition = (from: RequestStatus, to: RequestStatus) => NEXT[from].includes(to);
/** Only a draft can be edited: once sent, what the signers were shown must not change. */
export const isEditable = (s: RequestStatus) => s === "draft";
export const isFinal = (s: RequestStatus) => NEXT[s].length === 0;

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Esborrany", sent: "Enviada", completed: "Signada", declined: "Rebutjada", expired: "Caducada", voided: "Anul·lada",
};

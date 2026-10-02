// The colour of a status choice, by its stored value (one table for every database, so "active" looks the same everywhere).
// A tone is a meaning, not a colour: good (done, active), info (planned, in progress), warn (needs attention), bad (cancelled, lost), muted (closed, not applicable).
// The CSS maps each tone to the shared tokens; a value that is not listed stays neutral.
export type Tone = "good" | "info" | "warn" | "bad" | "muted";

const TONES: Record<string, Tone> = {
  // membership
  member: "good", former: "warn", prospect: "muted",
  // events, courses, visits
  planned: "info", running: "info", done: "good", cancelled: "bad",
  // attendance
  invited: "muted", confirmed: "info", attended: "good", declined: "bad", no_show: "warn",
  // sponsors
  ended: "muted", gold: "warn", silver: "muted",
  // shared
  paid: "good", overdue: "bad", unknown: "muted",
  active: "good", open: "info", closed: "muted", placed: "good", withdrawn: "muted", left: "bad",
  income: "good", expense: "muted", annual: "info", quarterly: "info", monthly: "info",
};

export const toneOf = (value: string): Tone | undefined => TONES[value];

import { describe, expect, it } from "vitest";
import { canTransition, isEditable, isFinal, STATUS_LABEL, type RequestStatus } from "@apex/sign/state";

const ALL: RequestStatus[] = ["draft", "sent", "completed", "declined", "expired", "voided"];

describe("the life of a request", () => {
  it("only a draft can be sent, and a sent request ends in exactly one of four ways", () => {
    expect(canTransition("draft", "sent")).toBe(true);
    for (const to of ["completed", "declined", "expired", "voided"] as const) expect(canTransition("sent", to)).toBe(true);
    for (const to of ALL.filter((s) => s !== "sent")) expect(canTransition("draft", to)).toBe(false);
  });

  it("an ended request never changes again", () => {
    for (const from of ["completed", "declined", "expired", "voided"] as const) {
      expect(isFinal(from)).toBe(true);
      for (const to of ALL) expect(canTransition(from, to)).toBe(false);
    }
    expect(isFinal("draft")).toBe(false);
    expect(isFinal("sent")).toBe(false);
  });

  it("only a draft is editable, so what the signers were shown cannot change", () => {
    expect(ALL.filter(isEditable)).toEqual(["draft"]);
  });

  it("every status has a label", () => {
    for (const s of ALL) expect(STATUS_LABEL[s]).toBeTruthy();
  });
});

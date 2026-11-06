import { describe, expect, it } from "vitest";
import { canTransition } from "../src/application-status";

describe("application status machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("queued", "submitting")).toBe(true);
    expect(canTransition("submitting", "submitted")).toBe(true);
    expect(canTransition("submitted", "interview")).toBe(true);
    expect(canTransition("interview", "offer")).toBe(true);
  });

  it("never moves backwards from a terminal state", () => {
    expect(canTransition("rejected", "interview")).toBe(false);
    expect(canTransition("offer", "submitted")).toBe(false);
  });

  it("lets the user finish an Easy Apply offer the agent could not send", () => {
    expect(canTransition("submitting", "user_to_apply")).toBe(true);
    expect(canTransition("user_to_apply", "submitted")).toBe(true);
    expect(canTransition("user_to_apply", "withdrawn")).toBe(true);
    expect(canTransition("user_to_apply", "interview")).toBe(false);
  });

  it("ignores stale events", () => {
    expect(canTransition("interview", "submitted")).toBe(false);
  });
});

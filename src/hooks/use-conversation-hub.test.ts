import { describe, it, expect } from "vitest";
import { threadState } from "./use-conversation-hub";

describe("threadState", () => {
  it("inbound actionable reply needs action", () => {
    expect(threadState([{ direction: "outbound" }, { direction: "inbound", needs_action: true }])).toBe("needs_action");
  });
  it("our message last means waiting on them", () => {
    expect(threadState([{ direction: "inbound", needs_action: true }, { direction: "outbound" }])).toBe("waiting");
  });
  it("inbound 'thanks' style reply is handled", () => {
    expect(threadState([{ direction: "inbound", needs_action: false }])).toBe("handled");
  });
});

import { describe, it, expect } from "vitest";
import { matchInstruction } from "./LaunchQuickStart";
const opts = [{ key: "p1", label: "Standard tech search" }, { key: "j1", label: "Senior React Engineer · Acme" }];
describe("matchInstruction", () => {
  it("finds the standard preset", () => expect(matchInstruction("launch the standard job launch", opts)).toBe("p1"));
  it("finds a past job", () => expect(matchInstruction("same as the react engineer job", opts)).toBe("j1"));
  it("returns null when nothing matches", () => expect(matchInstruction("launch it", opts)).toBeNull());
});

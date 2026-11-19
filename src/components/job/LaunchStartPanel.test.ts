import { describe, it, expect } from "vitest";
import { missingInfo } from "./LaunchStartPanel";
describe("missingInfo", () => {
  it("flags spec, intake, hook and ideal when empty", () =>
    expect(missingInfo({ description: "", intake_summary: null, launch_hook: "  ", ideal_candidate_line: undefined as any }))
      .toEqual(["description", "intake_summary", "launch_hook", "ideal_candidate_line"]));
  it("is empty when all present", () =>
    expect(missingInfo({ description: "a", intake_summary: "b", launch_hook: "c", ideal_candidate_line: "d" })).toEqual([]));
});

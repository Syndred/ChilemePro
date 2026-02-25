import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { cn } from "./utils";

describe("cn utility - property tests", () => {
  it("should always return a string", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const result = cn(a, b);
        expect(typeof result).toBe("string");
      }),
      { numRuns: 100 }
    );
  });

  it("should return empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});

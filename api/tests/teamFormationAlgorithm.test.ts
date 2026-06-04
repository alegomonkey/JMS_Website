import { describe, expect, it } from "vitest";
import { fnv1a32, mulberry32 } from "../src/services/teamFormationService.js";

describe("fnv1a32", () => {
  it("is stable for known inputs", () => {
    expect(fnv1a32(0)).toBe(1268118805); // stable known output for 0
    expect(fnv1a32(1)).toBeGreaterThan(0);
    expect(fnv1a32(1)).toBe(fnv1a32(1)); // deterministic
  });

  it("produces different values for different inputs", () => {
    expect(fnv1a32(1)).not.toBe(fnv1a32(2));
  });
});

describe("mulberry32", () => {
  it("first values are stable for a known seed", () => {
    const rand = mulberry32(42);
    const v1 = rand();
    const v2 = rand();
    const v3 = rand();
    expect(v1).toBeGreaterThanOrEqual(0);
    expect(v1).toBeLessThan(1);
    const rand2 = mulberry32(42);
    expect(rand2()).toBe(v1);
    expect(rand2()).toBe(v2);
    expect(rand2()).toBe(v3);
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });
});

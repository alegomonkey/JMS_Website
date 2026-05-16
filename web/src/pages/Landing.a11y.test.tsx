import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../test-helpers";
import { Landing } from "./Landing";

beforeEach(() => {
  stubGuestFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Landing a11y", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithProviders(<Landing />);
    await waitFor(() => {
      // Allow AuthProvider effect to settle.
      expect(document.title).toContain("Home");
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

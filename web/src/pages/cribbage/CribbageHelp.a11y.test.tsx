import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../../test-helpers";
import { CribbageHelp } from "./CribbageHelp";

beforeEach(() => {
  stubGuestFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CribbageHelp a11y", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithProviders(<CribbageHelp />, {
      initialEntries: ["/cribbage/help"],
    });
    await waitFor(() => expect(document.title).toContain("Counting cribbage"));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

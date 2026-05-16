import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../test-helpers";
import { Settings } from "./Settings";

beforeEach(() => {
  stubGuestFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Settings a11y", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithProviders(<Settings />, { initialEntries: ["/settings"] });
    await waitFor(() => expect(document.title).toContain("Settings"));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

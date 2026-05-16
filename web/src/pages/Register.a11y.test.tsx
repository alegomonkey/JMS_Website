import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../test-helpers";
import { Register } from "./Register";

beforeEach(() => {
  stubGuestFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Register a11y", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithProviders(<Register />, { initialEntries: ["/register"] });
    await waitFor(() => expect(document.title).toContain("Register"));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../test-helpers";
import { SignIn } from "./SignIn";

beforeEach(() => {
  stubGuestFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SignIn a11y", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithProviders(<SignIn />, { initialEntries: ["/signin"] });
    await waitFor(() => expect(document.title).toContain("Sign in"));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

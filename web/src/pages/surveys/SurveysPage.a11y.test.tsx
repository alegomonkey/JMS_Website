import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../../test-helpers";
import { SurveysPage } from "./SurveysPage";

beforeEach(() => {
  stubGuestFetch((url) => {
    if (url.endsWith("/api/auth/me"))
      return new Response(JSON.stringify({ user: { id: 1, username: "alice", role: "user" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.endsWith("/api/surveys"))
      return new Response(JSON.stringify({ surveys: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SurveysPage a11y", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithProviders(<SurveysPage />);
    await waitFor(() => {
      expect(document.title).toContain("Surveys");
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

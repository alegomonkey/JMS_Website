import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../../test-helpers";
import { TeamFormationPage } from "./TeamFormationPage";

beforeEach(() => {
  stubGuestFetch((url) => {
    if (url.endsWith("/api/auth/me"))
      return new Response(JSON.stringify({ user: { id: 1, username: "alice", role: "user" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.endsWith("/api/team-formations"))
      return new Response(JSON.stringify({ sessions: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TeamFormationPage a11y", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithProviders(<TeamFormationPage />);
    await waitFor(() => {
      expect(document.title).toContain("Team Formation");
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { waitFor, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../../test-helpers";
import { TeamFormationWizard } from "./TeamFormationWizard";

beforeEach(() => {
  stubGuestFetch((url) => {
    if (url.endsWith("/api/auth/me"))
      return new Response(JSON.stringify({ user: { id: 1, username: "alice", role: "user" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.includes("/api/surveys"))
      return new Response(JSON.stringify({ surveys: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TeamFormationWizard a11y", () => {
  it("new session step 1 has no axe violations", async () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/team-formation/new" element={<TeamFormationWizard />} />
      </Routes>,
      { initialEntries: ["/team-formation/new"] },
    );
    await waitFor(() => {
      expect(document.title).toContain("New Session");
    });
    // Wait for step 1 to render (multiple elements may match the text)
    await waitFor(() => {
      expect(screen.getAllByText(/Team Configuration/i).length).toBeGreaterThan(0);
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../../test-helpers";
import { TeamFormationResultsPage } from "./TeamFormationResultsPage";

beforeEach(() => {
  stubGuestFetch((url) => {
    if (url.endsWith("/api/auth/me"))
      return new Response(JSON.stringify({ user: { id: 1, username: "alice", role: "user" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.endsWith("/api/team-formations/1"))
      return new Response(
        JSON.stringify({
          session: {
            id: 1,
            title: "Test Session",
            description: null,
            status: "closed",
            slot_mode: "numbered",
            slot_count: 4,
            slots_submitted: 2,
            num_teams: 2,
            target_team_size: 2,
            invite_code: "TESTCODE1",
            survey_id: null,
            closes_at: null,
            rng_seed: null,
            formed_at: null,
            created_at: 0,
            updated_at: 0,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    if (url.endsWith("/api/team-formations/1/results"))
      return new Response(JSON.stringify({ teams: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.endsWith("/api/team-formations/1/responses"))
      return new Response(JSON.stringify({ responses: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TeamFormationResultsPage a11y", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/team-formation/:id/results" element={<TeamFormationResultsPage />} />
      </Routes>,
      { initialEntries: ["/team-formation/1/results"] },
    );
    await waitFor(() => {
      expect(document.title).toContain("Results");
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

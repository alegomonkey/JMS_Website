import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../../test-helpers";
import { SurveyBuilderPage } from "./SurveyBuilderPage";

function loggedInFetch(extra?: (url: string) => Response | undefined) {
  stubGuestFetch((url) => {
    const override = extra?.(url);
    if (override) return override;
    if (url.endsWith("/api/auth/me"))
      return new Response(JSON.stringify({ user: { id: 1, username: "alice", role: "user" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SurveyBuilderPage a11y", () => {
  it("new survey has no axe violations", async () => {
    beforeEach(() => loggedInFetch());
    loggedInFetch();
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/surveys/new" element={<SurveyBuilderPage />} />
      </Routes>,
      { initialEntries: ["/surveys/new"] },
    );
    await waitFor(() => {
      expect(document.title).toContain("New Survey");
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("edit survey has no axe violations", async () => {
    loggedInFetch((url) => {
      if (url.endsWith("/api/surveys/123"))
        return new Response(
          JSON.stringify({
            survey: { id: 123, title: "T", description: null, is_public: false, tags: [] },
            questions: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
    });
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/surveys/:id/edit" element={<SurveyBuilderPage />} />
      </Routes>,
      { initialEntries: ["/surveys/123/edit"] },
    );
    await waitFor(() => {
      expect(document.title).toContain("Edit Survey");
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

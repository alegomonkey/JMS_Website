import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { waitFor, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../../test-helpers";
import { ParticipantSurveyPage } from "./ParticipantSurveyPage";

beforeEach(() => {
  stubGuestFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ParticipantSurveyPage a11y", () => {
  it("code-prompt phase has no axe violations", async () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/team-formation/join" element={<ParticipantSurveyPage />} />
      </Routes>,
      { initialEntries: ["/team-formation/join"] },
    );
    await waitFor(() => {
      expect(screen.getByText(/Join a team formation session/i)).toBeTruthy();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

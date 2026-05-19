import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../lib/auth";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { PrefsProvider } from "../../lib/prefs";
import { jsonResponse } from "../../test-helpers";
import { CribbagePlay } from "./CribbagePlay";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/auth/me")) {
        return jsonResponse({ user: { id: 1, username: "alice", role: "user" } });
      }
      if (url.endsWith("/api/auth/csrf")) return jsonResponse({ token: "t" });
      return new Response("not stubbed", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CribbagePlay a11y", () => {
  it("renders the first hand without axe violations", async () => {
    const { container, findByLabelText } = render(
      <ThemeProvider>
        <PrefsProvider>
          <MemoryRouter initialEntries={["/cribbage/play?rounds=5"]}>
            <AuthProvider>
              <Routes>
                <Route path="/cribbage/play" element={<CribbagePlay />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </PrefsProvider>
      </ThemeProvider>,
    );
    // The input is present once the hand has been dealt.
    await findByLabelText(/Points for this hand/);
    await waitFor(() => expect(document.title).toContain("Cribbage"));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

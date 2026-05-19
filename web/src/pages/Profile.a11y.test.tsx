import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { ThemeProvider } from "../theme/ThemeProvider";
import { PrefsProvider } from "../lib/prefs";
import { jsonResponse } from "../test-helpers";
import { Profile } from "./Profile";

function renderRoute(username: string) {
  return render(
    <ThemeProvider>
      <PrefsProvider>
        <MemoryRouter initialEntries={[`/profile/${username}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/profile/:username" element={<Profile />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </PrefsProvider>
    </ThemeProvider>,
  );
}

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/auth/me")) return jsonResponse({ user: null });
      if (url.endsWith("/api/auth/csrf")) return jsonResponse({ token: "t" });
      if (url.endsWith("/api/users/alice/games")) return jsonResponse({ games: [] });
      if (url.endsWith("/api/users/alice/comments")) return jsonResponse({ comments: [] });
      if (url.endsWith("/api/users/alice")) {
        return jsonResponse({
          user: { id: 1, username: "alice", role: "user", bio: "hi", created_at: 1_700_000_000 },
          bestTimes: { "5": null, "20": null, "100": null },
          bestDaily: { "5": null, "20": null, "100": null },
        });
      }
      if (url.endsWith("/api/users/ghost")) {
        return new Response(JSON.stringify({ error: "user not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("not stubbed", { status: 404 });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Profile a11y", () => {
  beforeEach(() => stubFetch());

  it("has no axe violations for an existing user", async () => {
    const { container, findByText } = renderRoute("alice");
    await findByText(/About/);
    await waitFor(() => expect(document.title).toContain("alice"));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders the no-such-account view for a 404 without violations", async () => {
    const { container, findByText } = renderRoute("ghost");
    await findByText(/No such account/);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

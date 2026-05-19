import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { jsonResponse, renderWithProviders } from "../../test-helpers";
import { CribbageRecords } from "./CribbageRecords";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/auth/me")) return jsonResponse({ user: null });
      if (url.endsWith("/api/auth/csrf")) return jsonResponse({ token: "t" });
      if (url.includes("/api/cribbage/daily/leaderboard")) {
        return jsonResponse({
          round_count: 5,
          date: "2026-05-19",
          entries: [
            { rank: 1, id: 101, username: "alice", total_ms: 5000, mistakes: 0, created_at: 1_700_000_000 },
            { rank: 2, id: 102, username: "bob", total_ms: 7000, mistakes: 1, created_at: 1_700_000_500 },
          ],
        });
      }
      return new Response("not stubbed", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CribbageRecords a11y", () => {
  it("has no axe violations", async () => {
    const { container, findByText } = renderWithProviders(<CribbageRecords />, {
      initialEntries: ["/cribbage/records"],
    });
    await findByText("alice");
    await waitFor(() => expect(document.title).toContain("records"));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

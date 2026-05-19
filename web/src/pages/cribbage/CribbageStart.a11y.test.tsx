import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { jsonResponse, renderWithProviders } from "../../test-helpers";
import { CribbageStart } from "./CribbageStart";

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

describe("CribbageStart a11y", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithProviders(<CribbageStart />, {
      initialEntries: ["/cribbage"],
    });
    await waitFor(() => expect(document.title).toContain("Cribbage"));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./theme/ThemeProvider";
import { PrefsProvider } from "./lib/prefs";

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function stubGuestFetch(extra?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const extraResponse = extra?.(url, init);
    if (extraResponse) return extraResponse;
    if (url.endsWith("/api/auth/me")) return jsonResponse({ user: null });
    if (url.endsWith("/api/auth/csrf")) return jsonResponse({ token: "t" });
    return new Response("not stubbed", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderWithProviders(
  ui: ReactElement,
  options: { initialEntries?: string[] } = {},
): RenderResult {
  return render(
    <ThemeProvider>
      <PrefsProvider>
        <MemoryRouter initialEntries={options.initialEntries ?? ["/"]}>
          <AuthProvider>{ui}</AuthProvider>
        </MemoryRouter>
      </PrefsProvider>
    </ThemeProvider>,
  );
}

export function setMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

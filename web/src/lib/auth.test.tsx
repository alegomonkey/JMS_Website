import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";

function Probe(): JSX.Element {
  const { user, signIn, signOut } = useAuth();
  return (
    <div>
      <div data-testid="who">{user ? user.username : "guest"}</div>
      <button onClick={() => signIn("alice", "longpassword1")}>do-sign-in</button>
      <button onClick={() => signOut()}>do-sign-out</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Probe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const csrf = { token: "test-csrf" };

beforeEach(() => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/auth/me") && (!init || init.method === undefined)) {
      return jsonResponse({ user: null });
    }
    if (url.endsWith("/api/auth/csrf")) {
      return jsonResponse(csrf);
    }
    if (url.endsWith("/api/auth/login")) {
      return jsonResponse({ user: { id: 1, username: "alice", role: "user" } });
    }
    if (url.endsWith("/api/auth/logout")) {
      return new Response(null, { status: 204 });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AuthProvider", () => {
  it("starts as guest, signs in, then signs out", async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("guest"));

    await userEvent.click(screen.getByText("do-sign-in"));
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("alice"));

    await userEvent.click(screen.getByText("do-sign-out"));
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("guest"));
  });
});

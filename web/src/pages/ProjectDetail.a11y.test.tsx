import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";
import { AuthProvider } from "../lib/auth";
import { ThemeProvider } from "../theme/ThemeProvider";
import { ProjectDetail } from "./ProjectDetail";
import { listProjects } from "../lib/projects";
import { jsonResponse } from "../test-helpers";

const firstProject = listProjects()[0];

beforeEach(() => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/auth/me")) return jsonResponse({ user: null });
    if (url.endsWith("/api/auth/csrf")) return jsonResponse({ token: "t" });
    if (url.includes(`/api/projects/${firstProject?.slug}/comments`)) {
      return jsonResponse({ comments: [] });
    }
    return new Response("not stubbed", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProjectDetail a11y", () => {
  it("has no axe violations when comments are loaded", async () => {
    if (!firstProject) throw new Error("no projects in fixture data");
    const { container } = render(
      <ThemeProvider>
        <MemoryRouter initialEntries={[`/projects/${firstProject.slug}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/projects/:slug" element={<ProjectDetail />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );
    await waitFor(() => {
      // Loading text is gone once comments resolve.
      expect(screen.queryByText(/loading comments/i)).not.toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoteButton } from "./VoteButton";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/auth/csrf")) {
      return jsonResponse({ token: "t" });
    }
    if (url.includes("/vote") && init?.method === "POST") {
      return jsonResponse({ votes: 5 });
    }
    if (url.includes("/vote") && init?.method === "DELETE") {
      return jsonResponse({ votes: 4 });
    }
    return new Response("nope", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VoteButton", () => {
  it("calls onChange with new vote count after upvoting", async () => {
    const onChange = vi.fn();
    render(
      <VoteButton commentId={42} votes={4} voted={false} disabled={false} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onChange).toHaveBeenCalledWith(5, true);
  });

  it("is disabled when prop says so", () => {
    render(
      <VoteButton commentId={1} votes={0} voted={false} disabled={true} onChange={() => {}} />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

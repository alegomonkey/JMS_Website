import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, setMatchMedia, stubGuestFetch } from "../test-helpers";
import { NavBar } from "./NavBar";

beforeEach(() => {
  stubGuestFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("NavBar mobile drawer", () => {
  it("opens drawer on hamburger click and closes on Escape, restoring focus", async () => {
    setMatchMedia(true); // mobile
    const user = userEvent.setup();
    renderWithProviders(<NavBar />);

    const hamburger = await screen.findByRole("button", { name: /toggle navigation/i });
    expect(hamburger).toHaveAttribute("aria-expanded", "false");

    await user.click(hamburger);
    await waitFor(() => expect(hamburger).toHaveAttribute("aria-expanded", "true"));
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.style.overflow).toBe("");
    });
    await waitFor(() => {
      expect(hamburger).toHaveFocus();
    });
  });

  it("renders desktop sidebar without hamburger above breakpoint", async () => {
    setMatchMedia(false); // desktop
    renderWithProviders(<NavBar />);
    expect(
      screen.queryByRole("button", { name: /toggle navigation/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
  });
});

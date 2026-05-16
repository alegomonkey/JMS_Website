import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { renderWithProviders, stubGuestFetch } from "../test-helpers";
import { Projects } from "./Projects";

beforeEach(() => {
  stubGuestFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Projects a11y", () => {
  it("has no axe violations", async () => {
    const { container } = renderWithProviders(<Projects />, { initialEntries: ["/projects"] });
    await waitFor(() => expect(document.title).toContain("Projects"));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("opens listbox on ArrowDown and selects on Enter", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Projects />, { initialEntries: ["/projects"] });
    const combobox = screen.getByRole("combobox", { name: /filter projects by tag/i });
    await user.click(combobox);
    expect(combobox).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{ArrowDown}");
    // Listbox should be rendered with at least one option.
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();
    const firstOption = listbox.querySelector('[role="option"]');
    expect(firstOption).not.toBeNull();

    await user.keyboard("{Enter}");
    // After selection the active filters list should contain a chip.
    await waitFor(() => {
      expect(screen.getByRole("list", { name: /active filters/i })).toBeInTheDocument();
    });
  });

  it("closes listbox on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Projects />, { initialEntries: ["/projects"] });
    const combobox = screen.getByRole("combobox", { name: /filter projects by tag/i });
    await user.click(combobox);
    await user.keyboard("{ArrowDown}");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(combobox).toHaveAttribute("aria-expanded", "false");
  });
});

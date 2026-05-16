# Accessibility checklist

Target: WCAG 2.2 AAA. Run this manual pass before any release that touches navigation, page layout, theme tokens, or interactive controls. Automated coverage (`npm test`) handles axe smoke checks per page plus NavBar drawer / TagCombobox behavior — this list catches what axe cannot.

## Keyboard

For each route (`/`, `/projects`, `/projects/<slug>`, `/signin`, `/register`, `/settings`):

- Press Tab from the address bar. The first stop is the **Skip to content** link. Activating it focuses `<main id="main">`.
- Continue Tabbing through every interactive element. Focus indicator is visible on every stop (3px outline + 2px offset in `--bright`).
- Tab order matches visual order top-to-bottom, left-to-right.
- No focus traps outside the mobile drawer.
- Open the mobile drawer (≤768 px): focus moves to the Close button. Tab cycles between drawer elements only. Esc closes and returns focus to the hamburger.
- On `/projects`: focus the tag combobox, then `ArrowDown` opens the listbox, `ArrowUp/Down/Home/End` move highlight, `Enter` selects, `Esc` closes and returns focus to the input.
- Every interactive element is at least 44×44 CSS px (chip remove `×`, pager buttons, theme switch, nav links).

## Screen reader

Run on Landing, Projects, ProjectDetail using NVDA (Windows) or VoiceOver (macOS):

- Page title is announced after each route change (verify by listening for the title update; check `document.title` in DevTools).
- Single `<h1>` per page is announced as level 1. Headings within a page are level-2 only (no skips).
- Landmark navigation reaches `nav` (named "primary") and `main` independently.
- Active nav link is announced as "current page".
- Active filters: chip remove buttons announce "Remove <tag> filter".
- Pagination buttons announce "Previous page" / "Next page".
- Project tag combobox: when opened announces "expanded", arrow keys announce the active option, when no matches it announces "No matching tags." once via the polite live region.
- ProjectDetail loading state announces "Loading comments…" via `role="status"`.
- Sign-in/Register: submit with a bad credential, screen reader announces the error via `role="alert"` and the inputs are programmatically associated via `aria-describedby` (verify in DevTools accessibility tree) and marked `aria-invalid`.
- Settings theme switch announces as "Use light mode, switch, off/on".

## Viewport sweep

Resize the viewport in DevTools at: **320, 375, 768, 1024, 1440 px**.

- Below 768 px: sidebar is replaced by a sticky top bar with the hamburger. No horizontal scroll. PDF embed on the Landing page is hidden (download link remains).
- 768–1024 px: two-column shell appears, content respects the 60 rem max width.
- ≥1024 px: full desktop layout, no overflow or clipped text.
- Project grid wraps correctly: 1 column < 30 rem, multi-column with 15 rem min ≥ 30 rem, 17.5 rem min ≥ 48 rem.

## Zoom

- Browser zoom to **200 %**: no horizontal scrolling on any page, no overlapping content.
- Browser zoom to **400 %** (WCAG 1.4.10 / AAA 1.4.10): single-column reflow works on all pages, no clipping of the navigation drawer trigger.

## Contrast (DevTools Color Picker)

For both `dark` and `light` themes (Settings → Theme), spot-check with the browser DevTools color picker:

- Body text on `var(--bg)` ≥ 7:1.
- Heading text on `var(--bg)` ≥ 7:1.
- Link text on `var(--bg)` ≥ 7:1.
- Button text on `var(--muted)` ≥ 7:1.
- Chip text on `var(--muted)` ≥ 4.5:1 (chip text is 0.85em ≈ 12.75 px so still treated as normal).
- Border (`var(--border)`) against `var(--bg)` ≥ 3:1.
- Focus ring (`var(--bright)`) against the page background ≥ 3:1.
- Combobox active option: `var(--bg)` text on `var(--bright)` background — verify ≥ 7:1.

## Reduced motion

- Enable OS-level "Reduce motion".
- Open the mobile drawer — it appears without the slide transition.
- Toggle the theme switch — handle moves instantly without the 0.15s ease.

## High contrast / forced colors

- Windows: enable Settings → Accessibility → Contrast themes → "Aquatic"/"Dusk"/"Night sky".
- macOS Safari: enable Develop → Experimental → Forced Colors (or test Windows High Contrast via remote desktop).
- All interactive elements remain visible. Focus indicator still shows. The drawer backdrop does not hide focusable content (browser substitutes its own backdrop color).

## Form errors

- `/signin` and `/register`: submit with bad credentials. Error appears with `role="alert"` and the input(s) gain `aria-invalid="true"` plus `aria-describedby` pointing at the error id (verify in DevTools accessibility tree).

## Re-run automated checks

```
cd web
npm test     # axe + behavior smoke (must all pass)
npm run build  # tsc + production bundle (must succeed)
```

## When to rerun this checklist

- Any change to `web/src/components/NavBar.*`, `web/src/styles/global.css`, `web/src/theme/tokens.css`, or `web/src/theme/ThemeProvider.tsx`.
- Adding new pages or interactive controls (drawers, modals, dropdowns).
- Theme palette changes (border/contrast adjustments).

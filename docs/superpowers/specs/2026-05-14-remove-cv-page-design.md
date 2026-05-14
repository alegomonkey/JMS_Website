# Remove CV page, inline resume on Landing

## Summary

The site has a dedicated `/cv` page that only embeds `/resume.pdf`. Remove that page entirely and surface the same resume at the bottom of the Landing (home) page, with a download link above the embed.

## Motivation

The CV page is a single embed with no additional content — a separate route is unnecessary. Folding the resume into the home page reduces navigation depth and keeps the user on one page.

## Scope

In scope:

- Add a "Resume" section as the last section of `Landing.tsx`, containing:
  - A download link to `/resume.pdf` above the embed.
  - An `<object data="/resume.pdf">` embed that renders the PDF at its natural full height (the page scrolls, not the embed).
- Delete `web/src/pages/CV.tsx` and `web/src/pages/CV.module.css`.
- Remove the `<Route path="/cv" element={<CV />} />` route and `CV` import from `web/src/App.tsx`.
- Remove the "CV" `NavLink` from `web/src/components/NavBar.tsx`.

Out of scope:

- Changes to the resume PDF itself.
- Changes to other pages, the API, or routing beyond removing `/cv`.
- Reworking the Landing hero/contact sections.

## Design

### Landing page addition

Append a new `<section>` after the existing "Contact" section in `Landing.tsx`:

```tsx
<section>
  <h2>Resume</h2>
  <p>
    <a href="/resume.pdf" download>Download resume (PDF)</a>
  </p>
  <object
    data="/resume.pdf"
    type="application/pdf"
    className={styles.resumeEmbed}
    aria-label="Resume PDF"
  >
    <p>
      Your browser does not display PDFs inline.{" "}
      <a href="/resume.pdf">Download the resume</a>.
    </p>
  </object>
</section>
```

### Natural-height embed

`Landing.module.css` gets a new `.resumeEmbed` class:

```css
.resumeEmbed {
  display: block;
  width: 100%;
  /* Full US-letter page aspect ratio so the page scrolls, not the embed. */
  aspect-ratio: 8.5 / 11;
  border: 1px solid var(--border);
  background: var(--muted);
}
```

`aspect-ratio: 8.5 / 11` makes the embed as tall as a single letter-sized page would render at the current width, which is the closest "natural height" we can declare without measuring the PDF at runtime. The page itself scrolls; the embed has no inner scrollbar of its own. Multi-page PDFs still scroll *inside* the embed for subsequent pages (browser default), but the first page is fully visible without an inner scrollbar.

### Removals

- `web/src/pages/CV.tsx` — delete.
- `web/src/pages/CV.module.css` — delete.
- `web/src/App.tsx` — remove `import { CV } from "./pages/CV";` and the `<Route path="/cv" …>` line.
- `web/src/components/NavBar.tsx` — remove the `<li>` containing the `NavLink to="/cv"`.

The Landing hero copy currently mentions "a CV" — leave that wording as-is since the resume is still present, just inline now.

## Testing

- `npm run build` (or the project's typecheck script) inside `web/` to confirm no dangling imports or type errors after the deletions.
- Manual browser check: load `/`, scroll to the bottom, confirm the download link works and the PDF renders inline. Visit `/cv` to confirm it falls through to the existing NotFound route.

## Risks

- The `aspect-ratio` approach approximates "natural height" without inspecting the PDF. Acceptable trade-off — exact page measurement would require a PDF library, which is out of scope.
- Browsers without inline PDF support will see the fallback message. Unchanged from current behavior.

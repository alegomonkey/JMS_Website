import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { ProjectCard } from "../components/ProjectCard";
import { listAllTags, listProjects } from "../lib/projects";
import styles from "./Projects.module.css";

const PAGE_SIZE = 6;

export function Projects(): JSX.Element {
  const allProjects = useMemo(() => listProjects(), []);
  const allTags = useMemo(() => listAllTags(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const activeTags = searchParams.getAll("tag");
  const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const requestedPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const filtered = useMemo(() => {
    if (activeTags.length === 0) return allProjects;
    return allProjects.filter((p) => p.tags.some((t) => activeTags.includes(t)));
  }, [allProjects, activeTags]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  function addTag(tag: string): void {
    if (activeTags.includes(tag)) return;
    const next = new URLSearchParams(searchParams);
    next.append("tag", tag);
    next.delete("page");
    setSearchParams(next);
  }

  function removeTag(tag: string): void {
    const remaining = activeTags.filter((t) => t !== tag);
    const next = new URLSearchParams();
    for (const t of remaining) next.append("tag", t);
    setSearchParams(next);
  }

  function clearFilters(): void {
    setSearchParams(new URLSearchParams());
  }

  function goToPage(p: number): void {
    const next = new URLSearchParams(searchParams);
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    setSearchParams(next);
  }

  return (
    <div>
      <h1>Projects</h1>
      <p className={styles.intro}>
        A selection of things I&apos;ve built. Click any card for more — you&apos;ll
        need to sign in to leave a comment. <strong>{allProjects.length} projects.</strong>
      </p>

      <TagCombobox
        allTags={allTags}
        activeTags={activeTags}
        onSelect={addTag}
      />

      {activeTags.length > 0 && (
        <ul className={styles.chips} aria-label="Active filters">
          {activeTags.map((t) => (
            <li key={t} className={styles.chip}>
              <span>#{t}</span>
              <button
                type="button"
                aria-label={`Remove ${t} filter`}
                onClick={() => removeTag(t)}
                className={styles.chipRemove}
              >
                ×
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={clearFilters}>Clear</button>
          </li>
        </ul>
      )}

      {activeTags.length > 0 && (
        <p className={styles.count}>
          Showing {filtered.length} of {allProjects.length} projects.
        </p>
      )}

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p>No projects match those tags.</p>
          <button type="button" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : (
        <div className={styles.grid}>
          {pageItems.map((p) => (
            <ProjectCard
              key={p.slug}
              project={p}
              linkState={{ from: location.search }}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pager} role="navigation" aria-label="Pagination">
          <button
            type="button"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            ‹ Prev
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}

interface TagComboboxProps {
  allTags: string[];
  activeTags: string[];
  onSelect: (tag: string) => void;
}

function TagCombobox({ allTags, activeTags, onSelect }: TagComboboxProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allTags
      .filter((t) => !activeTags.includes(t))
      .filter((t) => t.toLowerCase().includes(q));
  }, [allTags, activeTags, query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent): void {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleSelect(tag: string): void {
    onSelect(tag);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className={styles.combobox} ref={containerRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="tag-options"
        aria-autocomplete="list"
        placeholder="Filter by tag…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && available.length > 0 && (
        <ul id="tag-options" role="listbox" className={styles.options}>
          {available.map((t) => (
            <li key={t} role="option" aria-selected={false}>
              <button
                type="button"
                className={styles.option}
                onClick={() => handleSelect(t)}
              >
                #{t}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && available.length === 0 && (
        <ul className={styles.options} aria-live="polite">
          <li className={styles.optionEmpty}>No matching tags.</li>
        </ul>
      )}
    </div>
  );
}

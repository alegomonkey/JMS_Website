import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { ProjectCard } from "../components/ProjectCard";
import { listAllTags, listProjects } from "../lib/projects";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import styles from "./Projects.module.css";

const PAGE_SIZE = 6;

export function Projects(): JSX.Element {
  useDocumentTitle("Projects — JMS");
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
        A selection of things I&apos;ve built. Click any project title for the
        full write-up, or use the tags below the description to filter the
        list. The <strong>repo</strong> link on each card opens that
        project&apos;s source on{" "}
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer noopener"
        >
          GitHub
        </a>{" "}
        — a public hosting site for source code that lets anyone read, copy,
        or contribute to a project.{" "}
        <strong>{allProjects.length} projects.</strong>
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
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={clearFilters}>Clear</button>
          </li>
        </ul>
      )}

      <p className={styles.count} aria-live="polite">
        {activeTags.length > 0
          ? `Showing ${filtered.length} of ${allProjects.length} projects.`
          : ""}
      </p>

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
              onTagClick={addTag}
              activeTags={activeTags}
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
            aria-label="Previous page"
          >
            ‹ Prev
          </button>
          <span aria-live="polite">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
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
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = "tag-options";
  const optionId = useCallback((tag: string): string => `tag-option-${tag}`, []);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allTags
      .filter((t) => !activeTags.includes(t))
      .filter((t) => t.toLowerCase().includes(q));
  }, [allTags, activeTags, query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent): void {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Reset active index when option list changes.
  useEffect(() => {
    if (available.length === 0) setActiveIndex(-1);
    else if (activeIndex >= available.length) setActiveIndex(available.length - 1);
  }, [available, activeIndex]);

  function handleSelect(tag: string): void {
    onSelect(tag);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
      } else if (available.length > 0) {
        setActiveIndex((i) => (i + 1) % available.length);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(Math.max(0, available.length - 1));
      } else if (available.length > 0) {
        setActiveIndex((i) => (i <= 0 ? available.length - 1 : i - 1));
      }
      return;
    }
    if (e.key === "Home" && open && available.length > 0) {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === "End" && open && available.length > 0) {
      e.preventDefault();
      setActiveIndex(available.length - 1);
      return;
    }
    if (e.key === "Enter" && open && activeIndex >= 0 && activeIndex < available.length) {
      e.preventDefault();
      handleSelect(available[activeIndex]!);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
  }

  const activeDescendant =
    open && activeIndex >= 0 && activeIndex < available.length
      ? optionId(available[activeIndex]!)
      : undefined;

  return (
    <div className={styles.combobox} ref={containerRef}>
      <label htmlFor="tag-filter" className={styles.srOnly}>
        Filter projects by tag
      </label>
      <input
        id="tag-filter"
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        placeholder="Filter by tag…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(e.target.value ? 0 : -1);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && available.length > 0 && (
        <ul id={listboxId} role="listbox" className={styles.options}>
          {available.map((t, idx) => {
            const isActive = idx === activeIndex;
            return (
              <li
                key={t}
                id={optionId(t)}
                role="option"
                aria-selected={isActive}
                className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(t);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                #{t}
              </li>
            );
          })}
        </ul>
      )}
      {open && available.length === 0 && query.trim() !== "" && (
        <ul id={listboxId} role="listbox" className={styles.options} aria-live="polite">
          <li className={styles.optionEmpty}>No matching tags.</li>
        </ul>
      )}
    </div>
  );
}

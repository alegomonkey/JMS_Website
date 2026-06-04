import { useEffect, useMemo, useRef, useState } from "react";
import { type Survey, fetchSurveys } from "../lib/surveyApi.js";
import styles from "./SurveyLibrary.module.css";

interface Props {
  onSelect?: (survey: Survey) => void;
  embeddedInWizard?: boolean;
}

type LibState =
  | { status: "loading" }
  | { status: "ready"; surveys: Survey[] }
  | { status: "error"; message: string };

export function SurveyLibrary({ onSelect, embeddedInWizard }: Props): JSX.Element {
  const [state, setState] = useState<LibState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchSurveys()
      .then(({ surveys }) => {
        if (!cancelled) setState({ status: "ready", surveys });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load surveys";
          setState({ status: "error", message: msg });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allTags = useMemo(() => {
    if (state.status !== "ready") return [];
    const set = new Set<string>();
    for (const s of state.surveys) {
      for (const t of s.tags) set.add(t);
    }
    return [...set].sort();
  }, [state]);

  const filtered = useMemo(() => {
    if (state.status !== "ready") return [];
    const q = query.trim().toLowerCase();
    return state.surveys.filter((s) => {
      const matchesQuery =
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q);
      const matchesTags =
        activeTags.length === 0 || activeTags.every((t) => s.tags.includes(t));
      return matchesQuery && matchesTags;
    });
  }, [state, query, activeTags]);

  function toggleTag(tag: string): void {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function handleGridKey(e: React.KeyboardEvent<HTMLDivElement>): void {
    const cards = cardRefs.current.filter(Boolean) as HTMLElement[];
    const focused = document.activeElement as HTMLElement;
    const idx = cards.indexOf(focused);
    if (idx === -1) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = cards[idx + 1];
      if (next) next.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = cards[idx - 1];
      if (prev) prev.focus();
    }
  }

  if (state.status === "loading") {
    return <p className={styles.message}>Loading surveys…</p>;
  }
  if (state.status === "error") {
    return (
      <p className={styles.message} role="alert">
        {state.message}
      </p>
    );
  }

  return (
    <div className={styles.root}>
      {!embeddedInWizard && <h2 className={styles.heading}>Survey Library</h2>}

      <div className={styles.controls}>
        <label htmlFor="survey-search" className={styles.srOnly}>
          Search surveys
        </label>
        <input
          id="survey-search"
          type="search"
          className={styles.search}
          placeholder="Search by title or description…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {allTags.length > 0 && (
        <div className={styles.tagFilter} role="group" aria-label="Filter by tag">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={activeTags.includes(tag) ? styles.tagActive : styles.tag}
              onClick={() => toggleTag(tag)}
              aria-pressed={activeTags.includes(tag)}
            >
              #{tag}
            </button>
          ))}
          {activeTags.length > 0 && (
            <button
              type="button"
              className={styles.clearTags}
              onClick={() => setActiveTags([])}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <p className={styles.count} aria-live="polite">
        {filtered.length === state.surveys.length
          ? `${state.surveys.length} survey${state.surveys.length === 1 ? "" : "s"}`
          : `${filtered.length} of ${state.surveys.length} surveys`}
      </p>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No surveys match your search.</p>
      ) : (
        <div
          className={styles.grid}
          onKeyDown={handleGridKey}
          role="list"
        >
          {filtered.map((survey, i) => (
            <SurveyCard
              key={survey.id}
              survey={survey}
              onSelect={onSelect}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  survey: Survey;
  onSelect?: (survey: Survey) => void;
  ref: (el: HTMLElement | null) => void;
}

function SurveyCard({ survey, onSelect, ref }: CardProps): JSX.Element {
  const headingId = `survey-card-${survey.id}`;
  const desc = survey.description ?? "";
  const truncated = desc.length > 120 ? desc.slice(0, 120) + "…" : desc;

  return (
    <article
      className={styles.card}
      aria-labelledby={headingId}
      role="listitem"
      tabIndex={onSelect ? 0 : undefined}
      ref={ref}
    >
      <h3 id={headingId} className={styles.cardTitle}>
        {survey.title}
      </h3>
      {truncated && <p className={styles.cardDesc}>{truncated}</p>}
      {survey.tags.length > 0 && (
        <ul className={styles.cardTags} aria-label="Tags">
          {survey.tags.map((t) => (
            <li key={t} className={styles.cardTag}>
              #{t}
            </li>
          ))}
        </ul>
      )}
      <p className={styles.cardOwner}>By {survey.owner_username}</p>
      {onSelect && (
        <button
          type="button"
          className={styles.selectBtn}
          onClick={() => onSelect(survey)}
        >
          Use this survey
        </button>
      )}
    </article>
  );
}

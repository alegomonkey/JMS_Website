import { Link } from "react-router-dom";
import type { Project } from "../lib/projects";
import styles from "./ProjectCard.module.css";

export function ProjectCard({
  project,
  linkState,
  onTagClick,
  activeTags,
}: {
  project: Project;
  linkState?: unknown;
  onTagClick?: (tag: string) => void;
  activeTags?: string[];
}): JSX.Element {
  const headingId = `project-${project.slug}-name`;
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.cardTitle}>
        <Link
          to={`/projects/${project.slug}`}
          state={linkState}
          className={styles.titleButton}
        >
          <span>{project.name}</span>
          <span aria-hidden="true" className={styles.titleArrow}>
            →
          </span>
        </Link>
      </h2>
      <p className={styles.desc}>{project.overview}</p>
      <div className={styles.row}>
        <a
          href={project.repoUrl}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`${project.name} repository (opens in new tab)`}
        >
          repo
        </a>
        <ul className={styles.tags} aria-label="Tags">
          {project.tags.map((t) => {
            const isActive = activeTags?.includes(t) ?? false;
            return (
              <li key={t}>
                <button
                  type="button"
                  className={`${styles.tagButton} ${isActive ? styles.tagActive : ""}`}
                  onClick={() => onTagClick?.(t)}
                  disabled={isActive || !onTagClick}
                  aria-label={
                    isActive
                      ? `${t} (filter already active)`
                      : `Filter by ${t}`
                  }
                  aria-pressed={isActive}
                >
                  #{t}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

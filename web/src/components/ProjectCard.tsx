import { Link } from "react-router-dom";
import type { Project } from "../lib/projects";
import styles from "./ProjectCard.module.css";

export function ProjectCard({
  project,
  linkState,
}: {
  project: Project;
  linkState?: unknown;
}): JSX.Element {
  const headingId = `project-${project.slug}-name`;
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.cardTitle}>
        <Link to={`/projects/${project.slug}`} state={linkState}>
          {project.name}
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
          {project.tags.map((t) => (
            <li key={t}>#{t}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

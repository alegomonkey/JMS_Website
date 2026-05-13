import { Link } from "react-router-dom";
import type { Project } from "../lib/projects";
import styles from "./ProjectCard.module.css";

export function ProjectCard({ project }: { project: Project }): JSX.Element {
  return (
    <article className={styles.card}>
      <h3>
        <Link to={`/projects/${project.slug}`}>{project.name}</Link>
      </h3>
      <p className={styles.desc}>{project.description}</p>
      <div className={styles.row}>
        <a href={project.repoUrl} target="_blank" rel="noreferrer noopener">
          repo
        </a>
        <ul className={styles.tags}>
          {project.tags.map((t) => (
            <li key={t}>#{t}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

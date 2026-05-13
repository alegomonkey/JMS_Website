import { ProjectCard } from "../components/ProjectCard";
import { listProjects } from "../lib/projects";
import styles from "./CV.module.css";

export function CV(): JSX.Element {
  const projects = listProjects();
  return (
    <div>
      <h1>CV</h1>
      <section>
        <h2>Resume</h2>
        <object
          data="/resume.pdf"
          type="application/pdf"
          className={styles.pdf}
          aria-label="Resume PDF"
        >
          <p>
            Your browser does not display PDFs inline.{" "}
            <a href="/resume.pdf">Download the resume</a>.
          </p>
        </object>
      </section>
      <section>
        <h2>Projects</h2>
        <div className={styles.grid}>
          {projects.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
        </div>
      </section>
    </div>
  );
}

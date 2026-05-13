import styles from "./Landing.module.css";

const links = [
  { label: "GitHub", url: "https://github.com/" },
  { label: "LinkedIn", url: "https://www.linkedin.com/" },
  { label: "Email", url: "mailto:john.sylvain@maine.edu" },
];

const contacts = [
  { label: "Email", value: "john.sylvain@maine.edu" },
  { label: "Location", value: "Maine, USA" },
];

export function Landing(): JSX.Element {
  return (
    <div>
      <section className={styles.hero}>
        <div
          className={styles.heroImage}
          role="img"
          aria-label="Decorative hero pattern"
        />
        <div>
          <h1>John Sylvain</h1>
          <p>
            Personal site. Notes, projects, and a CV. Built with React, Express,
            SQLite, and Nginx, all wrapped in Docker.
          </p>
        </div>
      </section>

      <section>
        <h2>Links</h2>
        <ul className={styles.linkTree}>
          {links.map((l) => (
            <li key={l.label}>
              <a href={l.url} target="_blank" rel="noreferrer noopener">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Contact</h2>
        <div className={styles.cards}>
          {contacts.map((c) => (
            <article key={c.label} className={styles.card}>
              <h3>{c.label}</h3>
              <p>{c.value}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

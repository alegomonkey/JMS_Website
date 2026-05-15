import styles from "./Landing.module.css";

const links = [
  { label: "GitHub", url: "https://github.com/alegomonkey" },
  { label: "LinkedIn", url: "https://www.linkedin.com/in/johnny-sylvain-322852362/" },
  { label: "Email", url: "mailto:alegomonkey@gmail.com" },
];

const contacts = [
  { label: "Email", value: "alegomonkey@gmail.com" },
  { label: "Location", value: "Maine, USA" },
];

export function Landing(): JSX.Element {
  return (
    <div>
      <section className={styles.hero}>
        <div className={styles.heroImage}>
          <img src="/hero.jpg" alt="Johnny Sylvain reading a book outdoors." />
        </div>
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

      <section>
        <h2>Resume</h2>
        <p>
          <a href="/resume.pdf" download>
            Download resume (PDF)
          </a>
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
    </div>
  );
}

import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import styles from "./Landing.module.css";

const links = [
  { label: "GitHub", url: "https://github.com/alegomonkey" },
  { label: "LinkedIn", url: "https://www.linkedin.com/in/johnny-sylvain-322852362/" },
  { label: "Email", url: "mailto:email@johnnysylvain.com" },
];

const contacts = [
  { label: "Email", value: "email@johnnysylvain.com" },
  { label: "Location", value: "Maine, USA" },
];

export function Landing(): JSX.Element {
  useDocumentTitle("Home — JMS");
  const { user } = useAuth();
  return (
    <div>
      <section className={styles.hero} aria-labelledby="hero-heading">
        <div className={styles.heroImage}>
          <img src="/hero.jpg" alt="Johnny Sylvain reading a book outdoors." />
        </div>
        <div>
          <h1 id="hero-heading">John Sylvain</h1>
          <p>
            Personal site for John Sylvain — projects, contact, and a daily
            cribbage speed test.
          </p>
        </div>
      </section>

      {user && (
        <section aria-labelledby="members-heading">
          <h2 id="members-heading">Members area</h2>
          <p>Signed in as {user.username}. Logged-in features:</p>
          <div className={styles.cards}>
            <article className={styles.card}>
              <h3>
                <Link to="/cribbage">Cribbage speed test</Link>
              </h3>
              <p>
                Recognise cribbage hand totals as fast as you can across 5,
                20, or 100 hands. Times and mistakes are saved to your
                profile and feed a global leaderboard.
              </p>
            </article>
            <article className={styles.card}>
              <h3>
                <Link to={`/profile/${encodeURIComponent(user.username)}`}>
                  Your profile
                </Link>
              </h3>
              <p>
                Set a bio, see your best times, and read comments others have
                left for you.
              </p>
            </article>
          </div>
        </section>
      )}

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

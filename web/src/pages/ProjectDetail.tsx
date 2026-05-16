import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { findProject } from "../lib/projects";
import { fetchComments, type Comment, type Sort } from "../lib/comments";
import { CommentList } from "../components/CommentList";
import { CommentForm } from "../components/CommentForm";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import styles from "./ProjectDetail.module.css";

export function ProjectDetail(): JSX.Element {
  const { slug = "" } = useParams<{ slug: string }>();
  const project = findProject(slug);
  const { user } = useAuth();
  const location = useLocation();
  const [sort, setSort] = useState<Sort>("top");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(project ? `${project.name} — JMS` : "Project not found — JMS");

  const from =
    typeof (location.state as { from?: unknown } | null)?.from === "string"
      ? ((location.state as { from: string }).from)
      : "";
  const backHref = `/projects${from}`;

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchComments(slug, sort);
      setComments(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not load comments");
    } finally {
      setLoading(false);
    }
  }, [slug, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyVoteChange(id: number, votes: number, voted: boolean): void {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, votes, voted: voted ? 1 : 0 } : c)),
    );
  }

  function applyCreated(c: Comment): void {
    setComments((prev) => [c, ...prev]);
  }

  function applyDeleted(id: number): void {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  if (!project) {
    return (
      <div>
        <Link to={backHref} className={styles.back}>
          ← Back to projects
        </Link>
        <h1>Not found</h1>
        <p>No project named {slug}.</p>
      </div>
    );
  }

  return (
    <div>
      <Link to={backHref} className={styles.back}>
        ← Back to projects
      </Link>
      <h1>{project.name}</h1>
      <ul className={styles.tags}>
        {project.tags.map((t) => (
          <li key={t}>#{t}</li>
        ))}
      </ul>
      <section>
        <h2>Overview</h2>
        <p>{project.overview}</p>
      </section>
      <section>
        <h2>My contributions</h2>
        <p>{project.contributions}</p>
      </section>
      <section>
        <h2>Documentation</h2>
        <p>{project.documentation}</p>
      </section>
      <p>
        <a href={project.repoUrl} target="_blank" rel="noreferrer noopener">
          {project.repoUrl}
        </a>
      </p>

      <section>
        <header className={styles.head}>
          <h2>Comments</h2>
          <div className={styles.sort} role="radiogroup" aria-label="Sort comments">
            <button
              type="button"
              role="radio"
              aria-checked={sort === "top"}
              onClick={() => setSort("top")}
              className={sort === "top" ? styles.active : ""}
            >
              Top
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={sort === "new"}
              onClick={() => setSort("new")}
              className={sort === "new" ? styles.active : ""}
            >
              Newest
            </button>
          </div>
        </header>

        {user ? (
          <CommentForm projectSlug={slug} onCreated={applyCreated} />
        ) : (
          <p className={styles.signedOut}>Sign in to comment or vote.</p>
        )}

        {error && <p role="alert">{error}</p>}
        {loading ? (
          <p role="status" aria-live="polite">Loading comments…</p>
        ) : (
          <CommentList
            comments={comments}
            canVote={Boolean(user)}
            isAdmin={user?.role === "admin"}
            onVoteChange={applyVoteChange}
            onDelete={applyDeleted}
          />
        )}
      </section>
    </div>
  );
}

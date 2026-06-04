import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { useDocumentTitle } from "../lib/useDocumentTitle.js";
import { type Survey, approveSurvey, fetchPendingSurveys } from "../lib/surveyApi.js";

export function AdminSurveysPage(): JSX.Element {
  useDocumentTitle("Admin: Survey Approvals — JMS");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [pageState, setPageState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<number | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user || user.role !== "admin") {
      void navigate("/", { replace: true });
      return;
    }
    fetchPendingSurveys()
      .then(({ surveys: s }) => {
        setSurveys(s);
        setPageState("ready");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load surveys");
        setPageState("error");
      });
  }, [user, loading, navigate]);

  async function handleApprove(id: number): Promise<void> {
    setApproving(id);
    try {
      await approveSurvey(id);
      setSurveys((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(null);
    }
  }

  if (loading || pageState === "loading") return <p>Loading…</p>;
  if (pageState === "error") return <p role="alert">{error}</p>;

  return (
    <div style={{ maxWidth: "52rem" }}>
      <h1>Survey Approvals</h1>
      <p>Surveys marked public by users — approve to make them visible in the library.</p>
      {error && <p role="alert" style={{ color: "var(--err, red)" }}>{error}</p>}
      {surveys.length === 0 ? (
        <p>No surveys pending approval.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
          {surveys.map((s) => (
            <li
              key={s.id}
              style={{
                border: "1px solid var(--border)",
                padding: "1rem",
                background: "var(--muted)",
              }}
            >
              <strong>{s.title}</strong>
              <span style={{ marginLeft: "0.75rem", color: "var(--fg-muted, var(--border))", fontSize: "0.875em" }}>
                by {s.owner_username}
              </span>
              {s.description && <p style={{ margin: "0.4rem 0 0.6rem" }}>{s.description}</p>}
              {s.tags.length > 0 && (
                <p style={{ margin: "0 0 0.6rem", fontSize: "0.875em" }}>
                  {s.tags.map((t) => `#${t}`).join(" ")}
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleApprove(s.id)}
                disabled={approving === s.id}
                style={{ cursor: approving === s.id ? "wait" : "pointer" }}
              >
                {approving === s.id ? "Approving…" : "Approve"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

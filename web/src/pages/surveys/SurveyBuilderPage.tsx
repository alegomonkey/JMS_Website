import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth.js";
import { SurveyBuilder } from "../../components/SurveyBuilder.js";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import styles from "./SurveyBuilderPage.module.css";

export function SurveyBuilderPage(): JSX.Element {
  const { id } = useParams<{ id?: string }>();
  const surveyId = id ? Number(id) : undefined;
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useDocumentTitle(surveyId ? "Edit Survey — JMS" : "New Survey — JMS");

  if (loading) {
    return <p className={styles.message}>Loading…</p>;
  }

  if (!user) {
    return (
      <div>
        <h1>{surveyId ? "Edit Survey" : "New Survey"}</h1>
        <p>You must be signed in to build surveys.</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>{surveyId ? "Edit Survey" : "New Survey"}</h1>
      <SurveyBuilder
        surveyId={surveyId}
        onSurveyCreated={(newId) => {
          void navigate(`/surveys/${newId}/edit`, { replace: true });
        }}
      />
    </div>
  );
}

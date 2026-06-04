import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth.js";
import { SurveyLibrary } from "../../components/SurveyLibrary.js";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import styles from "./SurveysPage.module.css";

export function SurveysPage(): JSX.Element {
  useDocumentTitle("Surveys — JMS");
  const { user, loading } = useAuth();

  if (loading) {
    return <p className={styles.message}>Loading…</p>;
  }

  if (!user) {
    return (
      <div>
        <h1>Surveys</h1>
        <p>
          <Link to="/signin">Sign in</Link> to view and create surveys.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Surveys</h1>
        <Link to="/surveys/new" className={styles.newBtn}>
          + New Survey
        </Link>
      </div>
      <SurveyLibrary />
    </div>
  );
}

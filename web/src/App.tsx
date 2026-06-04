import { Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { AuthProvider } from "./lib/auth";
import { Landing } from "./pages/Landing";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Settings } from "./pages/Settings";
import { SignIn } from "./pages/SignIn";
import { Register } from "./pages/Register";
import { AuthComplete } from "./pages/AuthComplete";
import { Profile } from "./pages/Profile";
import { CribbageStart } from "./pages/cribbage/CribbageStart";
import { CribbagePlay } from "./pages/cribbage/CribbagePlay";
import { CribbageRecords } from "./pages/cribbage/CribbageRecords";
import { CribbageGameDetail } from "./pages/cribbage/CribbageGameDetail";
import { CribbageHelp } from "./pages/cribbage/CribbageHelp";
import { CribbageImprovementChart } from "./pages/cribbage/CribbageImprovementChart";
import { SurveysPage } from "./pages/surveys/SurveysPage";
import { SurveyBuilderPage } from "./pages/surveys/SurveyBuilderPage";
import { TeamFormationPage } from "./pages/teamFormation/TeamFormationPage";
import { TeamFormationWizard } from "./pages/teamFormation/TeamFormationWizard";
import { ParticipantSurveyPage } from "./pages/teamFormation/ParticipantSurveyPage";
import { TeamFormationResultsPage } from "./pages/teamFormation/TeamFormationResultsPage";
import { AdminSurveysPage } from "./pages/AdminSurveysPage";
import { useDocumentTitle } from "./lib/useDocumentTitle";

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-shell">
        <NavBar />
        <main className="app-main" id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:slug" element={<ProjectDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/register" element={<Register />} />
            <Route path="/auth/complete" element={<AuthComplete />} />
            <Route path="/profile/:username" element={<Profile />} />
            <Route path="/profile/:username/chart" element={<CribbageImprovementChart />} />
            <Route path="/cribbage" element={<CribbageStart />} />
            <Route path="/cribbage/play" element={<CribbagePlay />} />
            <Route path="/cribbage/records" element={<CribbageRecords />} />
            <Route path="/cribbage/games/:id" element={<CribbageGameDetail />} />
            <Route path="/cribbage/help" element={<CribbageHelp />} />
            <Route path="/surveys" element={<SurveysPage />} />
            <Route path="/surveys/new" element={<SurveyBuilderPage />} />
            <Route path="/surveys/:id/edit" element={<SurveyBuilderPage />} />
            <Route path="/team-formation" element={<TeamFormationPage />} />
            <Route path="/team-formation/join" element={<ParticipantSurveyPage />} />
            <Route path="/team-formation/new" element={<TeamFormationWizard />} />
            <Route path="/team-formation/:id/edit" element={<TeamFormationWizard />} />
            <Route path="/team-formation/:id/results" element={<TeamFormationResultsPage />} />
            <Route path="/admin/surveys" element={<AdminSurveysPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
}

function NotFound(): JSX.Element {
  useDocumentTitle("Not found — JMS");
  return (
    <div>
      <h1>Not found</h1>
      <p>That page does not exist.</p>
    </div>
  );
}

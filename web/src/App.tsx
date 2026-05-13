import { Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { AuthProvider } from "./lib/auth";
import { Landing } from "./pages/Landing";
import { CV } from "./pages/CV";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Settings } from "./pages/Settings";
import { SignIn } from "./pages/SignIn";
import { Register } from "./pages/Register";

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <div className="app-shell">
        <NavBar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/cv" element={<CV />} />
            <Route path="/projects/:slug" element={<ProjectDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/register" element={<Register />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
}

function NotFound(): JSX.Element {
  return (
    <div>
      <h1>Not found</h1>
      <p>That page does not exist.</p>
    </div>
  );
}

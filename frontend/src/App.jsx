import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import { lazy, Suspense } from "react";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import SharedReceiptPage from "./pages/SharedReceiptPage";
import LegalPage from "./pages/LegalPage";
import { useAuth } from "./hooks/useAuth";
const PricingPage = lazy(() => import("./pages/PricingPage"));
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage"));
function Protected({ children }) {
  const { token, loading } = useAuth();
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">
        Loading Fuelo…
      </div>
    );
  return token ? children : <Navigate to="/login" replace />;
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/pricing"
        element={
          <Suspense fallback={<p>Loading plans…</p>}>
            <PricingPage />
          </Suspense>
        }
      />
      <Route
        path="/invite/:token"
        element={
          <Suspense fallback={<p>Loading invitation…</p>}>
            <AcceptInvitePage />
          </Suspense>
        }
      />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/share/:token" element={<SharedReceiptPage />} />
      <Route path="/receipt/:token" element={<SharedReceiptPage />} />
      <Route
        path="/*"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      />
    </Routes>
  );
}

import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import NewTransactionPage from "./pages/NewTransactionPage";
import TransactionListPage from "./pages/TransactionListPage";
import TransactionDetailPage from "./pages/TransactionDetailPage";
import SharedReceiptPage from "./pages/SharedReceiptPage";
import { useAuth } from "./context/AuthContext";
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

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loginRequest } from "../api/auth.api";
const C = createContext(null);
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("fuelo_token"));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("fuelo_user"));
    } catch {
      return null;
    }
  });
  const [workspaces, setWorkspaces] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("fuelo_workspaces")) || [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    token ? localStorage.setItem("fuelo_token", token) : localStorage.removeItem("fuelo_token");
  }, [token]);
  async function login(phone, password) {
    setLoading(true);
    try {
      const d = await loginRequest({ phone, password });
      const t = d.token || d.accessToken;
      if (!t) throw Error("No JWT returned");
      setToken(t);
      const u = d.user || d.client || d.dealer || null;
      setUser(u);
      if (u) localStorage.setItem("fuelo_user", JSON.stringify(u));

      if (d.workspaces) {
        setWorkspaces(d.workspaces);
        localStorage.setItem("fuelo_workspaces", JSON.stringify(d.workspaces));
      }

      return d;
    } finally {
      setLoading(false);
    }
  }

  function updateSession(d) {
    if (d.token) setToken(d.token);

    if (d.dealer) {
      const nextUser = { ...(user || {}), ...d.dealer };
      setUser(nextUser);
      localStorage.setItem("fuelo_user", JSON.stringify(nextUser));
    }

    if (d.workspaces) {
      setWorkspaces(d.workspaces);
      localStorage.setItem("fuelo_workspaces", JSON.stringify(d.workspaces));
    } else if (d.dealer && workspaces.length) {
      const nextWorkspaces = workspaces.map((ws) =>
        ws.workspaceId === d.dealer.workspaceId ? { ...ws, ...d.dealer } : ws
      );
      setWorkspaces(nextWorkspaces);
      localStorage.setItem("fuelo_workspaces", JSON.stringify(nextWorkspaces));
    }
  }
  function logout() {
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    localStorage.removeItem("fuelo_user");
    localStorage.removeItem("fuelo_workspaces");
  }
  return (
    <C.Provider
      value={useMemo(
        () => ({ token, user, workspaces, loading, login, logout, updateSession }),
        [token, user, workspaces, loading]
      )}
    >
      {children}
    </C.Provider>
  );
}
export function useAuth() {
  return useContext(C);
}

import { createContext, useContext, useState } from "react";
import { loginRequest, signupRequest } from "../api/auth.api";

const C = createContext(null);

function readSessionValue(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("fuelo_token"));
  const [user, setUser] = useState(() => readSessionValue("fuelo_user", null));
  const [workspaces, setWorkspaces] = useState(() => readSessionValue("fuelo_workspaces", []));
  const [loading, setLoading] = useState(false);

  function updateSession({ token: nextToken, dealer, workspaces: nextWorkspaces }) {
    if (nextToken) {
      localStorage.setItem("fuelo_token", nextToken);
      setToken(nextToken);
    }
    if (dealer) {
      const nextUser = user?.workspaceId === dealer.workspaceId ? { ...user, ...dealer } : dealer;
      localStorage.setItem("fuelo_user", JSON.stringify(nextUser));
      setUser(nextUser);
    }
    if (nextWorkspaces || dealer) {
      const list =
        nextWorkspaces ??
        workspaces.map((ws) => (ws.workspaceId === dealer.workspaceId ? { ...ws, ...dealer } : ws));
      localStorage.setItem("fuelo_workspaces", JSON.stringify(list));
      setWorkspaces(list);
    }
  }

  async function authenticate(request, payload) {
    setLoading(true);
    try {
      const session = await request(payload);
      updateSession(session);
      return session;
    } finally {
      setLoading(false);
    }
  }

  function login(phone, password) {
    return authenticate(loginRequest, { phone, password });
  }

  function signup(payload) {
    return authenticate(signupRequest, payload);
  }

  function logout() {
    localStorage.removeItem("fuelo_token");
    localStorage.removeItem("fuelo_user");
    localStorage.removeItem("fuelo_workspaces");
    setToken(null);
    setUser(null);
    setWorkspaces([]);
  }

  return (
    <C.Provider value={{ token, user, workspaces, loading, login, signup, logout, updateSession }}>
      {children}
    </C.Provider>
  );
}

export function useAuth() {
  return useContext(C);
}

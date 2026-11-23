import { createContext, useContext, useEffect, useState } from "react";
import client, {
  clearSession,
  persistSession,
  refreshStorageKey,
  sessionEvent,
} from "../api/client";
import { loginRequest, logoutRequest, signupRequest } from "../api/auth.api";

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

  useEffect(() => {
    const sync = () => {
      setToken(localStorage.getItem("fuelo_token"));
      setUser(readSessionValue("fuelo_user", null));
      setWorkspaces(readSessionValue("fuelo_workspaces", []));
    };
    window.addEventListener(sessionEvent, sync);
    return () => window.removeEventListener(sessionEvent, sync);
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function check() {
      try {
        const { data } = await client.get("/auth/session");
        const current = readSessionValue("fuelo_user", null);
        if (!active || current?.workspaceId !== data.dealer.workspaceId) return;
        const merged = { ...current, ...data.dealer };
        if (JSON.stringify(current) !== JSON.stringify(merged)) persistSession({ dealer: merged });
      } catch {
        /* The client handles revoked and expired sessions. */
      }
    }
    check();
    const timer = setInterval(check, 25_000);
    window.addEventListener("focus", check);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [token]);

  function updateSession({ token: nextToken, refreshToken, dealer, workspaces: nextWorkspaces }) {
    if (refreshToken) localStorage.setItem(refreshStorageKey, refreshToken);
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
      persistSession(session);
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
    const refreshToken = localStorage.getItem(refreshStorageKey);
    if (refreshToken) logoutRequest(refreshToken).catch(() => {});
    clearSession();
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

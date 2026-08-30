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
      return d;
    } finally {
      setLoading(false);
    }
  }
  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem("fuelo_user");
  }
  return (
    <C.Provider
      value={useMemo(() => ({ token, user, loading, login, logout }), [token, user, loading])}
    >
      {children}
    </C.Provider>
  );
}
export function useAuth() {
  return useContext(C);
}

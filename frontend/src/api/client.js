import axios from "axios";

const client = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api").replace(/\/+$/, ""),
  headers: { "Content-Type": "application/json" },
});

export const refreshStorageKey = "fuelo_refresh_token";
export const sessionEvent = "fuelo:session";
export const billingEvent = "fuelo:billing";
let refreshInFlight;

export function clearSession() {
  for (const key of ["fuelo_token", "fuelo_user", "fuelo_workspaces", refreshStorageKey]) {
    localStorage.removeItem(key);
  }
  window.dispatchEvent(new CustomEvent(sessionEvent, { detail: null }));
}

export function persistSession({ token, refreshToken, dealer, workspaces }) {
  if (token) localStorage.setItem("fuelo_token", token);
  if (refreshToken) localStorage.setItem(refreshStorageKey, refreshToken);
  if (dealer) localStorage.setItem("fuelo_user", JSON.stringify(dealer));
  if (workspaces) localStorage.setItem("fuelo_workspaces", JSON.stringify(workspaces));
  window.dispatchEvent(new CustomEvent(sessionEvent));
}

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("fuelo_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const publicAuth = /^\/auth\/(?:login|signup|refresh|logout|accept-invite|otp\/[^/]+)$/;
client.interceptors.response.use(
  (response) => {
    if (response.headers["x-fuelo-usage-warning"]) {
      window.dispatchEvent(new CustomEvent(billingEvent, { detail: { warning: true } }));
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 402) {
      let details = error.response.data;
      if (details instanceof Blob) details = await details.text();
      if (typeof details === "string") {
        try {
          details = JSON.parse(details);
        } catch {
          details = null;
        }
      }
      if (details?.upgradeRequired) {
        error.response.data = details;
        window.dispatchEvent(new CustomEvent(billingEvent, { detail: details }));
      }
    }
    const config = error.config;
    if (error.response?.status !== 401 || !config || config.retried || publicAuth.test(config.url))
      throw error;
    config.retried = true;
    const current = localStorage.getItem("fuelo_token");
    if (current && config.headers.Authorization !== `Bearer ${current}`) return client(config);

    const refreshToken = localStorage.getItem(refreshStorageKey);
    if (!refreshToken) {
      clearSession();
      throw error;
    }
    refreshInFlight ??= client
      .post("/auth/refresh", { refreshToken })
      .then(({ data }) => {
        if (localStorage.getItem(refreshStorageKey) !== refreshToken) return false;
        persistSession(data);
        return true;
      })
      .catch(() => {
        if (localStorage.getItem(refreshStorageKey) === refreshToken) clearSession();
        return false;
      })
      .finally(() => {
        refreshInFlight = undefined;
      });

    if (!(await refreshInFlight)) throw error;
    return client(config);
  }
);

export default client;

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiRequest, resetCsrf } from "./api";

export type Role = "user" | "admin";

export type OauthProvider = "github" | "google";

export interface User {
  id: number;
  username: string;
  role: Role;
}

export interface ProvidersEnabled {
  github: boolean;
  google: boolean;
}

interface MeResponse {
  user: User | null;
  providersEnabled: ProvidersEnabled;
  linkedProviders: OauthProvider[];
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  providersEnabled: ProvidersEnabled;
  linkedProviders: OauthProvider[];
  signIn: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DEFAULT_PROVIDERS: ProvidersEnabled = { github: false, google: false };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [providersEnabled, setProvidersEnabled] =
    useState<ProvidersEnabled>(DEFAULT_PROVIDERS);
  const [linkedProviders, setLinkedProviders] = useState<OauthProvider[]>([]);

  const applyMe = useCallback((res: MeResponse): void => {
    setUser(res.user);
    setProvidersEnabled(res.providersEnabled ?? DEFAULT_PROVIDERS);
    setLinkedProviders(res.linkedProviders ?? []);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await apiRequest<MeResponse>("/api/auth/me");
      applyMe(res);
    } catch {
      setUser(null);
      setProvidersEnabled(DEFAULT_PROVIDERS);
      setLinkedProviders([]);
    }
  }, [applyMe]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<MeResponse>("/api/auth/me")
      .then((res) => {
        if (!cancelled) applyMe(res);
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setProvidersEnabled(DEFAULT_PROVIDERS);
          setLinkedProviders([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyMe]);

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await apiRequest<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    resetCsrf();
    setUser(res.user);
    // linkedProviders may be stale until Settings (or another consumer) calls refresh().
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const res = await apiRequest<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: { username, password },
    });
    resetCsrf();
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    await apiRequest<void>("/api/auth/logout", { method: "POST" });
    resetCsrf();
    setUser(null);
    setLinkedProviders([]);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      providersEnabled,
      linkedProviders,
      signIn,
      register,
      signOut,
      refresh,
    }),
    [user, loading, providersEnabled, linkedProviders, signIn, register, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

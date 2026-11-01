"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AUTH_KEY,
  AUTH_CLEARED_EVENT,
  AuthUser,
  RegisterInitResponse,
  apiGetProfile,
  apiLogin,
  apiRegisterInit,
  apiRegisterVerify,
  clearAuthUser,
  getAuthUser,
  saveAuthUser,
} from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  registerInit: (payload: {
    username: string;
    email: string;
    password: string;
    invitation_code?: string | null;
  }) => Promise<RegisterInitResponse>;
  registerVerify: (payload: {
    pending_registration_id: string;
    verification_code: string;
  }) => Promise<void>;
  logout: () => void;
  updateUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Login and registration responses carry only identity and role, so the
  // restricted-assistant flags arrive from a background profile refresh.
  const refreshProfile = useCallback((base: AuthUser) => {
    apiGetProfile()
      .then((profile) => {
        // Merge into the latest stored session so a concurrent token rotation
        // survives, and drop the result if another account signed in.
        const current = getAuthUser();
        if (!current || current.user_id !== base.user_id) return;
        const updated: AuthUser = {
          ...current,
          role: profile.role,
          email: profile.email,
          can_use_task_agent: profile.can_use_task_agent,
          can_use_code_analyzer: profile.can_use_code_analyzer,
        };
        saveAuthUser(updated);
        setUser(updated);
      })
      .catch(() => {
        // Keep the stored role and flags; protected backend routes still
        // enforce access.
      });
  }, []);

  useEffect(() => {
    const stored = getAuthUser();
    if (!stored) {
      setIsLoading(false);
      return;
    }
    // A valid cached user is enough to render the app immediately. The profile
    // call below only refreshes role, email and assistant access, so we must NOT block `isLoading`
    // on it — if `/user/profile` hangs or never settles (slow/unreachable
    // backend after a refresh) the whole app would otherwise be stuck on a
    // "Loading…" screen forever. Resolve loading now and update in background.
    setUser(stored);
    setIsLoading(false);
    refreshProfile(stored);
  }, [refreshProfile]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === AUTH_KEY && e.newValue === null) {
        setUser(null);
      }
    };
    const handleSameWindowClear = () => setUser(null);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(AUTH_CLEARED_EVENT, handleSameWindowClear);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(AUTH_CLEARED_EVENT, handleSameWindowClear);
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const authUser = await apiLogin(username, password);
      setUser(authUser);
      refreshProfile(authUser);
    },
    [refreshProfile]
  );

  const registerInit = useCallback(
    async (payload: {
      username: string;
      email: string;
      password: string;
      invitation_code?: string | null;
    }) => apiRegisterInit(payload),
    []
  );

  const registerVerify = useCallback(
    async (payload: {
      pending_registration_id: string;
      verification_code: string;
    }) => {
      const authUser = await apiRegisterVerify(payload);
      setUser(authUser);
      refreshProfile(authUser);
    },
    [refreshProfile]
  );

  const logout = useCallback(() => {
    clearAuthUser();
    setUser(null);
  }, []);

  const updateUser = useCallback(
    (updated: AuthUser) => {
      // Profile updates omit the access flags; keep them for the same account
      // and role, otherwise re-read them so a changed role cannot reuse them.
      const previous = getAuthUser();
      const sameAccess =
        previous?.user_id === updated.user_id &&
        previous?.role === updated.role;
      const next: AuthUser =
        sameAccess && updated.can_use_task_agent === undefined
          ? {
              ...updated,
              can_use_task_agent: previous.can_use_task_agent,
              can_use_code_analyzer: previous.can_use_code_analyzer,
            }
          : updated;
      saveAuthUser(next);
      setUser(next);
      if (!sameAccess) refreshProfile(next);
    },
    [refreshProfile]
  );

  // Memoized so the context identity only changes when auth state actually
  // changes. An unmemoized object literal here re-renders every consumer in the
  // app (chat, thread list, admin panel) on any AuthProvider render.
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login,
      registerInit,
      registerVerify,
      logout,
      updateUser,
    }),
    [user, isLoading, login, registerInit, registerVerify, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

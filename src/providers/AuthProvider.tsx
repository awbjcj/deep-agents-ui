"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  AUTH_KEY,
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

  useEffect(() => {
    const stored = getAuthUser();
    if (!stored) {
      setIsLoading(false);
      return;
    }
    // A valid cached user is enough to render the app immediately. The profile
    // call below only refreshes role/email, so we must NOT block `isLoading`
    // on it — if `/user/profile` hangs or never settles (slow/unreachable
    // backend after a refresh) the whole app would otherwise be stuck on a
    // "Loading…" screen forever. Resolve loading now and update in background.
    setUser(stored);
    setIsLoading(false);
    apiGetProfile()
      .then((profile) => {
        const updated: AuthUser = {
          ...stored,
          role: profile.role,
          email: profile.email,
        };
        saveAuthUser(updated);
        setUser(updated);
      })
      .catch(() => {
        // Keep the stored role; protected backend routes still enforce access.
      });
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === AUTH_KEY && e.newValue === null) {
        setUser(null);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const authUser = await apiLogin(username, password);
    setUser(authUser);
  }, []);

  const registerInit = useCallback(
    async (payload: {
      username: string;
      email: string;
      password: string;
      invitation_code?: string | null;
    }) => apiRegisterInit(payload),
    [],
  );

  const registerVerify = useCallback(
    async (payload: { pending_registration_id: string; verification_code: string }) => {
      const authUser = await apiRegisterVerify(payload);
      setUser(authUser);
    },
    [],
  );

  const logout = useCallback(() => {
    clearAuthUser();
    setUser(null);
  }, []);

  const updateUser = useCallback((updated: AuthUser) => {
    saveAuthUser(updated);
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        registerInit,
        registerVerify,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

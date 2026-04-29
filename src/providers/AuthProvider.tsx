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
    setUser(stored);
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
      })
      .finally(() => setIsLoading(false));
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
    async (payload: { username: string; email: string; password: string }) =>
      apiRegisterInit(payload),
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

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

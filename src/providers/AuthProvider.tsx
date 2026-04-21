"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  AuthUser,
  getAuthUser,
  saveAuthUser,
  clearAuthUser,
  apiLogin,
  apiRegister,
  apiGetProfile,
  AUTH_KEY,
} from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
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
    // Optimistically restore from localStorage so the UI appears immediately,
    // then confirm the role from the server in case it changed since last login.
    setUser(stored);
    apiGetProfile()
      .then((profile) => {
        const updated: AuthUser = { ...stored, role: profile.role };
        saveAuthUser(updated);
        setUser(updated);
      })
      .catch(() => {
        // Network error — keep the stored role; the backend will enforce access.
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Sync React state when auth is cleared (e.g. token expiry in getAuthUser)
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
    // apiLogin already calls saveAuthUser — only update React state here
    setUser(authUser);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const authUser = await apiRegister(username, password);
    // apiRegister already calls saveAuthUser — only update React state here
    setUser(authUser);
  }, []);

  const logout = useCallback(() => {
    clearAuthUser();
    setUser(null);
  }, []);

  const updateUser = useCallback((updated: AuthUser) => {
    saveAuthUser(updated);
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateUser }}>
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

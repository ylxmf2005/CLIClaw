"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { login as apiLogin, setAuthToken, getAuthToken } from "@/lib/api";

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (token: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "cliclaw_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  // Restore token from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setAuthToken(saved);
      setState({
        token: saved,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } else {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  const login = useCallback(async (token: string): Promise<boolean> => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const valid = await apiLogin(token);
      if (valid) {
        sessionStorage.setItem(TOKEN_KEY, token);
        setState({
          token,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        return true;
      } else {
        setState({
          token: null,
          isAuthenticated: false,
          isLoading: false,
          error: "Invalid token",
        });
        return false;
      }
    } catch {
      setState({
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: "Connection failed. Is the daemon running?",
      });
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setState({
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

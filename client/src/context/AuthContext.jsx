import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../api/client";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem("ttm_token");
    setUser(null);
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("ttm_token");
      if (!token) {
        setLoading(false);
        return;
      }

      const { data } = await api.get("/auth/me");
      setUser(data.user);
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = useCallback(async (payload) => {
    const { data } = await api.post("/auth/login", payload);
    localStorage.setItem("ttm_token", data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const signup = useCallback(async (payload) => {
    const { data } = await api.post("/auth/signup", payload);
    localStorage.setItem("ttm_token", data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const value = {
    user,
    loading,
    login,
    signup,
    logout,
    refreshUser: fetchCurrentUser,
    isAuthenticated: Boolean(user),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isPending: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  redirectToLogin: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isPending, setIsPending] = useState(true);

  // Check if user is logged in on mount
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const pathname = window.location.pathname;
    const isDashboardRoute = pathname.startsWith("/dashboard");

    // Solo comprobar sesión cuando el usuario está en una ruta que lo requiere (dashboard)
    if (!isDashboardRoute) {
      setUser(null);
      setIsPending(false);
      return;
    }

    try {
      const response = await fetch("/api/users/me", {
        credentials: "include",
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Auth check error:", error);
      setUser(null);
    } finally {
      setIsPending(false);
    }
  }

  async function login(email: string, password: string) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Error al iniciar sesión");
    }

    const data = await response.json();
    setUser(data.user);
  }

  async function register(email: string, password: string) {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Error al registrar usuario");
    }

    const data = await response.json();
    setUser(data.user);
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
    }
  }

  function redirectToLogin() {
    window.location.href = "/login";
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isPending,
        login,
        register,
        logout,
        redirectToLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

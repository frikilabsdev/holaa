import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { hashPassword, verifyPassword, generateSessionToken } from "@/worker/utils/auth";
import { checkRateLimit, getClientIP } from "@/worker/utils/rate-limit";
import { logger } from "@/worker/utils/logger";

const app = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

const SESSION_TOKEN_COOKIE_NAME = "session_token";
const SESSION_TTL = 60 * 24 * 60 * 60; // 60 days in seconds

interface SessionData {
  userId: string;
  email: string;
}

// Session storage using Cloudflare KV
async function getSession(kv: KVNamespace, token: string): Promise<SessionData | null> {
  try {
    const value = await kv.get(`session:${token}`, "json");
    return value as SessionData | null;
  } catch (error) {
    console.error("Error getting session from KV:", error);
    return null;
  }
}

async function setSession(kv: KVNamespace, token: string, data: SessionData): Promise<void> {
  try {
    await kv.put(`session:${token}`, JSON.stringify(data), { expirationTtl: SESSION_TTL });
  } catch (error) {
    console.error("Error setting session in KV:", error);
    throw error;
  }
}

async function deleteSession(kv: KVNamespace, token: string): Promise<void> {
  try {
    await kv.delete(`session:${token}`);
  } catch (error) {
    console.error("Error deleting session from KV:", error);
  }
}

// Export for use in other modules if needed
export { getSession, setSession, deleteSession };

// Register schema
const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

// Login schema
const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña requerida"),
});

// Register endpoint
app.post("/register", zValidator("json", registerSchema), async (c) => {
  // Rate limiting: 5 registrations per hour per IP
  const clientIP = getClientIP(c.req);
  
  const rateLimitResult = await checkRateLimit(c.env.SESSIONS_KV, clientIP, {
    limit: 5,
    window: 3600, // 1 hour
    keyPrefix: "rate_limit:register",
  });
  
  if (!rateLimitResult.allowed) {
    return c.json(
      {
        error: "Demasiados intentos de registro. Por favor, intente más tarde.",
        reset: rateLimitResult.reset,
      },
      429
    );
  }

  const { email, password } = c.req.valid("json");

  try {
    // Check if user already exists
    const existingUser = await c.env.DB.prepare(
      "SELECT id FROM users WHERE email = ?"
    )
      .bind(email)
      .first<{ id: string }>();

    if (existingUser) {
      return c.json({ error: "El email ya está registrado" }, 400);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate user ID
    const userId = crypto.randomUUID();

    // Create user
    await c.env.DB.prepare(
      "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)"
    )
      .bind(userId, email, passwordHash)
      .run();

    // Generate session token
    const sessionToken = generateSessionToken();

    // Store session in KV
    await setSession(c.env.SESSIONS_KV, sessionToken, { userId, email });

    // Set cookie
    setCookie(c, SESSION_TOKEN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: c.req.url.startsWith("https"),
      maxAge: 60 * 24 * 60 * 60, // 60 days
    });

    logger.info("User registered successfully", {
      userId,
      email,
    });

    return c.json({
      success: true,
      user: { id: userId, email },
    }, 201);
  } catch (error) {
    logger.error("Registration error", error, {
      email,
    });
    return c.json({ error: "Error al crear la cuenta" }, 500);
  }
});

// Login endpoint
app.post("/login", zValidator("json", loginSchema), async (c) => {
  // Rate limiting: 10 login attempts per 15 minutes per IP
  const clientIP = getClientIP(c.req);
  
  const rateLimitResult = await checkRateLimit(c.env.SESSIONS_KV, clientIP, {
    limit: 10,
    window: 900, // 15 minutes
    keyPrefix: "rate_limit:login",
  });
  
  if (!rateLimitResult.allowed) {
    return c.json(
      {
        error: "Demasiados intentos de inicio de sesión. Por favor, intente más tarde.",
        reset: rateLimitResult.reset,
      },
      429
    );
  }

  const { email, password } = c.req.valid("json");

  try {
    // Find user
    const user = await c.env.DB.prepare(
      "SELECT id, email, password_hash FROM users WHERE email = ?"
    )
      .bind(email)
      .first<{ id: string; email: string; password_hash: string }>();

    if (!user) {
      return c.json({ error: "Email o contraseña incorrectos" }, 401);
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return c.json({ error: "Email o contraseña incorrectos" }, 401);
    }

    // Generate session token
    const sessionToken = generateSessionToken();

    // Store session in KV
    await setSession(c.env.SESSIONS_KV, sessionToken, { userId: user.id, email: user.email });

    // Set cookie
    setCookie(c, SESSION_TOKEN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: c.req.url.startsWith("https"),
      maxAge: 60 * 24 * 60 * 60, // 60 days
    });

    logger.info("User logged in successfully", {
      userId: user.id,
      email: user.email,
    });

    return c.json({
      success: true,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    logger.error("Login error", error, {
      email,
    });
    return c.json({ error: "Error al iniciar sesión" }, 500);
  }
});

// Get current user endpoint
app.get("/me", async (c) => {
  const sessionToken = getCookie(c, SESSION_TOKEN_COOKIE_NAME);

  if (!sessionToken) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const session = await getSession(c.env.SESSIONS_KV, sessionToken);
  if (!session) {
    return c.json({ error: "Sesión inválida" }, 401);
  }

  return c.json({
    id: session.userId,
    email: session.email,
  });
});

// Logout endpoint
app.post("/logout", async (c) => {
  const sessionToken = getCookie(c, SESSION_TOKEN_COOKIE_NAME);

  if (sessionToken) {
    await deleteSession(c.env.SESSIONS_KV, sessionToken);
  }

  setCookie(c, SESSION_TOKEN_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: c.req.url.startsWith("https"),
    maxAge: 0,
  });

  return c.json({ success: true });
});

// Authentication middleware
export async function authMiddleware(
  c: any,
  next: () => Promise<void>
) {
  const sessionToken = getCookie(c, SESSION_TOKEN_COOKIE_NAME);

  if (!sessionToken) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const session = await getSession(c.env.SESSIONS_KV, sessionToken);
  if (!session) {
    return c.json({ error: "Sesión inválida" }, 401);
  }

  // Set user in context
  c.set("user", {
    id: session.userId,
    email: session.email,
  });

  await next();
}

export const SESSION_COOKIE_NAME = SESSION_TOKEN_COOKIE_NAME;

export default app;

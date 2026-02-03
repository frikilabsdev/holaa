import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";
import tenantsApi from "@/worker/api/tenants";
import servicesApi from "@/worker/api/services";
import schedulesApi from "@/worker/api/schedules";
import publicApi from "@/worker/api/public";
import appointmentsApi from "@/worker/api/appointments";
import employeesApi from "@/worker/api/employees";
import serviceImagesApi from "@/worker/api/service-images";
import socialApi from "@/worker/api/social";
import paymentsApi from "@/worker/api/payments";
import customizeApi from "@/worker/api/customize";
import uploadApi from "@/worker/api/upload";
import authApi, { authMiddleware as authMw, SESSION_COOKIE_NAME, deleteSession } from "@/worker/api/auth";
import adminApi from "@/worker/api/admin";
import { logger } from "@/worker/utils/logger";

const app = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

// Request timing middleware
app.use("*", async (c, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID().split("-")[0]; // Short request ID
  
  // Add request ID to context for tracing
  c.set("requestId", requestId);
  
  await next();
  
  const duration = Date.now() - start;
  const method = c.req.method;
  const path = c.req.path;
  const statusCode = c.res.status;
  
  // Log request with timing
  logger.request(method, path, statusCode, duration, {
    requestId,
    userAgent: c.req.header("user-agent"),
  });
});

// CORS configuration
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "https://citame.click",
  "https://www.citame.click",
  "https://admin.citame.click",
];

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*"; // Allow requests without origin (e.g., Postman)
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      return null; // Deny unknown origins (production security)
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400, // 24 hours
    credentials: true,
  })
);

// Global error handler
app.onError((err, c) => {
  const requestId = c.get("requestId") || "unknown";
  
  // Log error with structured logging
  logger.error("Request error", err, {
    requestId,
    url: c.req.url,
    method: c.req.method,
    userId: c.get("user")?.id,
  });

  // Return generic error message to client (don't expose internal details)
  const isDevelopment = c.req.url.includes("localhost") || c.req.url.includes("127.0.0.1");
  
  if (err.name === "ZodError") {
    // Validation errors - show details
    const zodError = err as { issues?: unknown };
    return c.json(
      {
        error: "Error de validación",
        details: isDevelopment ? zodError.issues : undefined,
      },
      400
    );
  }

  // Database errors
  if (err.message.includes("SQL") || err.message.includes("database")) {
    return c.json(
      {
        error: "Error en la base de datos",
        message: isDevelopment ? err.message : undefined,
      },
      500
    );
  }

  // Generic error
  const errorStatus = (err as { status?: number }).status;
  const status: 400 | 401 | 403 | 404 | 500 = (errorStatus && (errorStatus === 400 || errorStatus === 401 || errorStatus === 403 || errorStatus === 404 || errorStatus === 500)) ? errorStatus as 400 | 401 | 403 | 404 | 500 : 500;
  return c.json(
    {
      error: "Error interno del servidor",
      message: isDevelopment ? err.message : undefined,
    },
    status
  );
});

// Health check endpoint
app.get("/health", async (c) => {
  try {
    // Check database connectivity
    await c.env.DB.prepare("SELECT 1").first();
    
    // Check KV connectivity
    await c.env.SESSIONS_KV.get("health-check");
    
    logger.info("Health check passed", {
      timestamp: new Date().toISOString(),
    });
    
    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: "ok",
        kv: "ok",
      },
    });
  } catch (error) {
    logger.error("Health check failed", error);
    
    return c.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
      },
      503
    );
  }
});

// 404 handler
app.notFound((c) => {
  logger.warn("404 Not Found", {
    path: c.req.path,
    method: c.req.method,
  });
  return c.json({ error: "Endpoint no encontrado" }, 404);
});

// Mount API routes
app.route("/api/auth", authApi);
app.route("/api/tenants", tenantsApi);
app.route("/api/services", servicesApi);
app.route("/api/schedules", schedulesApi);
app.route("/api/appointments", appointmentsApi);
app.route("/api/employees", employeesApi);
app.route("/api/public", publicApi);
app.route("/api/service-images", serviceImagesApi);
app.route("/api/social", socialApi);
app.route("/api/payments", paymentsApi);
app.route("/api/customize", customizeApi);
app.route("/api/upload", uploadApi);
app.route("/api/admin", adminApi);

// Get current user (alias for /api/auth/me)
app.get("/api/users/me", authMw, async (c) => {
  return c.json(c.get("user"));
});

// Logout (alias for /api/auth/logout)
app.post("/api/logout", async (c) => {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);

  if (sessionToken) {
    await deleteSession(c.env.SESSIONS_KV, sessionToken);
  }

  setCookie(c, SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: c.req.url.startsWith("https"),
    maxAge: 0,
  });

  return c.json({ success: true });
});

// Re-export authMiddleware for convenience
export { authMiddleware } from "@/worker/api/auth";

// Export as Cloudflare Worker handler
export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    return app.fetch(request, env, ctx);
  },
};

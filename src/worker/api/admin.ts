import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { hashPassword } from "@/worker/utils/auth";

const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SESSION_TTL = 60 * 24 * 60 * 60; // 24 hours

async function getAdminSession(kv: KVNamespace, token: string): Promise<boolean> {
  const value = await kv.get(`admin:session:${token}`);
  return value === "1";
}

async function setAdminSession(kv: KVNamespace, token: string): Promise<void> {
  await kv.put(`admin:session:${token}`, "1", { expirationTtl: ADMIN_SESSION_TTL });
}

async function deleteAdminSession(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(`admin:session:${token}`);
}

const app = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

const loginSchema = z.object({
  password: z.string().min(1, "Contraseña requerida"),
});

// POST /api/admin/login
app.post("/login", zValidator("json", loginSchema), async (c) => {
  const adminPassword = c.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return c.json({ error: "Panel de administración no configurado" }, 503);
  }
  const { password } = c.req.valid("json");
  if (password !== adminPassword) {
    return c.json({ error: "Contraseña incorrecta" }, 401);
  }
  const token = crypto.randomUUID();
  await setAdminSession(c.env.SESSIONS_KV, token);
  setCookie(c, ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: c.req.url.startsWith("https"),
    maxAge: ADMIN_SESSION_TTL,
  });
  return c.json({ success: true });
});

// POST /api/admin/logout
app.post("/logout", async (c) => {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (token) {
    await deleteAdminSession(c.env.SESSIONS_KV, token);
  }
  deleteCookie(c, ADMIN_SESSION_COOKIE);
  return c.json({ success: true });
});

// GET /api/admin/me - check if admin session is valid
app.get("/me", async (c) => {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) {
    return c.json({ admin: false, supportPhone: null }, 200);
  }
  const valid = await getAdminSession(c.env.SESSIONS_KV, token);
  return c.json({
    admin: valid,
    supportPhone: valid && c.env.SUPPORT_PHONE ? c.env.SUPPORT_PHONE : null,
  });
});

// All routes below require admin
app.use("/businesses/*", async (c, next) => {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) {
    return c.json({ error: "No autorizado" }, 401);
  }
  const valid = await getAdminSession(c.env.SESSIONS_KV, token);
  if (!valid) {
    return c.json({ error: "No autorizado" }, 401);
  }
  await next();
});

app.use("/users/*", async (c, next) => {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) {
    return c.json({ error: "No autorizado" }, 401);
  }
  const valid = await getAdminSession(c.env.SESSIONS_KV, token);
  if (!valid) {
    return c.json({ error: "No autorizado" }, 401);
  }
  await next();
});

// GET /api/admin/businesses - list all tenants with owner email and whatsapp
app.get("/businesses", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id as tenant_id, t.slug, t.is_active, t.owner_user_id,
            u.email as owner_email,
            bc.whatsapp
     FROM tenants t
     JOIN users u ON t.owner_user_id = u.id
     LEFT JOIN business_configs bc ON bc.tenant_id = t.id
     ORDER BY t.created_at DESC`
  )
    .all<{
      tenant_id: number;
      slug: string;
      is_active: number;
      owner_user_id: string;
      owner_email: string;
      whatsapp: string | null;
    }>();

  return c.json(
    (results || []).map((r) => ({
      tenant_id: r.tenant_id,
      slug: r.slug,
      is_active: !!r.is_active,
      owner_user_id: r.owner_user_id,
      owner_email: r.owner_email,
      whatsapp: r.whatsapp || null,
    }))
  );
});

// PATCH /api/admin/businesses/:id/active
const activeSchema = z.object({ is_active: z.boolean() });
app.patch("/businesses/:id/active", zValidator("json", activeSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = parseInt(id, 10);
  if (Number.isNaN(tenantId)) {
    return c.json({ error: "ID inválido" }, 400);
  }
  const { is_active } = c.req.valid("json");
  await c.env.DB.prepare("UPDATE tenants SET is_active = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(is_active ? 1 : 0, tenantId)
    .run();
  return c.json({ success: true });
});

// DELETE /api/admin/businesses/:id
app.delete("/businesses/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = parseInt(id, 10);
  if (Number.isNaN(tenantId)) {
    return c.json({ error: "ID inválido" }, 400);
  }

  const db = c.env.DB;

  const services = await db.prepare("SELECT id FROM services WHERE tenant_id = ?").bind(tenantId).all<{ id: number }>();
  const serviceIds = (services.results || []).map((s) => s.id);

  if (serviceIds.length > 0) {
    const placeholders = serviceIds.map(() => "?").join(",");
    await db.prepare(`DELETE FROM schedule_exceptions WHERE service_id IN (${placeholders})`).bind(...serviceIds).run();
    await db.prepare(`DELETE FROM availability_schedules WHERE service_id IN (${placeholders})`).bind(...serviceIds).run();
    await db.prepare(`DELETE FROM service_images WHERE service_id IN (${placeholders})`).bind(...serviceIds).run();
    await db.prepare(`DELETE FROM appointments WHERE service_id IN (${placeholders})`).bind(...serviceIds).run();
    await db.prepare(`DELETE FROM services WHERE tenant_id = ?`).bind(tenantId).run();
  } else {
    await db.prepare("DELETE FROM appointments WHERE tenant_id = ?").bind(tenantId).run();
  }

  await db.prepare("DELETE FROM schedule_exceptions WHERE tenant_id = ?").bind(tenantId).run();
  await db.prepare("DELETE FROM payment_methods WHERE tenant_id = ?").bind(tenantId).run();
  await db.prepare("DELETE FROM social_networks WHERE tenant_id = ?").bind(tenantId).run();
  await db.prepare("DELETE FROM visual_customizations WHERE tenant_id = ?").bind(tenantId).run();
  await db.prepare("DELETE FROM business_configs WHERE tenant_id = ?").bind(tenantId).run();
  await db.prepare("DELETE FROM tenants WHERE id = ?").bind(tenantId).run();

  return c.json({ success: true });
});

// POST /api/admin/users/:id/change-password
const changePasswordSchema = z.object({
  new_password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});
app.post("/users/:id/change-password", zValidator("json", changePasswordSchema), async (c) => {
  const userId = c.req.param("id");
  const { new_password } = c.req.valid("json");
  const passwordHash = await hashPassword(new_password);
  const result = await c.env.DB.prepare(
    "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(passwordHash, userId)
    .run();
  if (result.meta.changes === 0) {
    return c.json({ error: "Usuario no encontrado" }, 404);
  }
  return c.json({ success: true });
});

export default app;

import { Hono } from "hono";
import { authMiddleware } from "@/worker/api/auth";
import type { Tenant, BusinessConfig } from "@/shared/types";

const app = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

// Get all tenants for the authenticated user
app.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }
  
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE owner_user_id = ? ORDER BY created_at DESC"
  )
    .bind(user.id)
    .all<Tenant>();

  return c.json(results);
});

// Get a specific tenant by slug
app.get("/:slug", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const slug = c.req.param("slug");

  const tenant = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE slug = ? AND owner_user_id = ?"
  )
    .bind(slug, user.id)
    .first<Tenant>();

  if (!tenant) {
    return c.json({ error: "Negocio no encontrado" }, 404);
  }

  return c.json(tenant);
});

// Create a new tenant
app.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const body = await c.req.json();

  if (!body.slug) {
    return c.json({ error: "El slug es requerido" }, 400);
  }

  // Check if slug is already taken
  const existing = await c.env.DB.prepare(
    "SELECT id FROM tenants WHERE slug = ?"
  )
    .bind(body.slug)
    .first();

  if (existing) {
    return c.json({ error: "Este slug ya está en uso" }, 409);
  }

  // Create tenant
  const result = await c.env.DB.prepare(
    `INSERT INTO tenants (slug, owner_user_id, is_active, created_at, updated_at)
     VALUES (?, ?, 1, datetime('now'), datetime('now'))`
  )
    .bind(body.slug, user.id)
    .run();

  const tenantId = result.meta.last_row_id;

  // Create default business config
  await c.env.DB.prepare(
    `INSERT INTO business_configs (tenant_id, created_at, updated_at)
     VALUES (?, datetime('now'), datetime('now'))`
  )
    .bind(tenantId)
    .run();

  // Create default visual customization
  await c.env.DB.prepare(
    `INSERT INTO visual_customizations (tenant_id, created_at, updated_at)
     VALUES (?, datetime('now'), datetime('now'))`
  )
    .bind(tenantId)
    .run();

  const tenant = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE id = ?"
  )
    .bind(tenantId)
    .first<Tenant>();

  return c.json(tenant, 201);
});

// Update a tenant
app.put("/:slug", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const slug = c.req.param("slug");
  const body = await c.req.json();

  const tenant = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE slug = ? AND owner_user_id = ?"
  )
    .bind(slug, user.id)
    .first<Tenant>();

  if (!tenant) {
    return c.json({ error: "Negocio no encontrado" }, 404);
  }

  // If changing slug, check availability
  if (body.slug && body.slug !== slug) {
    const existing = await c.env.DB.prepare(
      "SELECT id FROM tenants WHERE slug = ?"
    )
      .bind(body.slug)
      .first();

    if (existing) {
      return c.json({ error: "Este slug ya está en uso" }, 409);
    }
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.slug) {
    updates.push("slug = ?");
    values.push(body.slug);
  }

  if (typeof body.is_active === "boolean") {
    updates.push("is_active = ?");
    values.push(body.is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json(tenant);
  }

  updates.push("updated_at = datetime('now')");
  values.push(tenant.id);

  await c.env.DB.prepare(
    `UPDATE tenants SET ${updates.join(", ")} WHERE id = ?`
  )
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE id = ?"
  )
    .bind(tenant.id)
    .first<Tenant>();

  return c.json(updated);
});

// Delete a tenant
app.delete("/:slug", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const slug = c.req.param("slug");

  const tenant = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE slug = ? AND owner_user_id = ?"
  )
    .bind(slug, user.id)
    .first<Tenant>();

  if (!tenant) {
    return c.json({ error: "Negocio no encontrado" }, 404);
  }

  await c.env.DB.prepare("DELETE FROM tenants WHERE id = ?")
    .bind(tenant.id)
    .run();

  return c.json({ success: true });
});

// Get business config
app.get("/:slug/config", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const slug = c.req.param("slug");

  const tenant = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE slug = ? AND owner_user_id = ?"
  )
    .bind(slug, user.id)
    .first<Tenant>();

  if (!tenant) {
    return c.json({ error: "Negocio no encontrado" }, 404);
  }

  const config = await c.env.DB.prepare(
    "SELECT * FROM business_configs WHERE tenant_id = ?"
  )
    .bind(tenant.id)
    .first<BusinessConfig>();

  return c.json(config);
});

// Update business config
app.put("/:slug/config", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const slug = c.req.param("slug");
  const body = await c.req.json();

  const tenant = await c.env.DB.prepare(
    "SELECT * FROM tenants WHERE slug = ? AND owner_user_id = ?"
  )
    .bind(slug, user.id)
    .first<Tenant>();

  if (!tenant) {
    return c.json({ error: "Negocio no encontrado" }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    "business_name",
    "address",
    "phone",
    "whatsapp",
    "google_maps_url",
    "profile_image_url",
    "header_image_url",
  ];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) {
    return c.json({ error: "No hay campos para actualizar" }, 400);
  }

  updates.push("updated_at = datetime('now')");
  values.push(tenant.id);

  await c.env.DB.prepare(
    `UPDATE business_configs SET ${updates.join(", ")} WHERE tenant_id = ?`
  )
    .bind(...values)
    .run();

  const config = await c.env.DB.prepare(
    "SELECT * FROM business_configs WHERE tenant_id = ?"
  )
    .bind(tenant.id)
    .first<BusinessConfig>();

  return c.json(config);
});

export default app;

import { Hono } from "hono";
import { authMiddleware } from "@/worker/api/auth";
import type { SocialNetwork } from "@/shared/types";

const app = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

// Helper to verify tenant ownership
async function verifyTenantOwnership(
  db: D1Database,
  userId: string,
  tenantId: number
): Promise<boolean> {
  const tenant = await db
    .prepare("SELECT id FROM tenants WHERE id = ? AND owner_user_id = ?")
    .bind(tenantId, userId)
    .first();
  return !!tenant;
}

// Get all social networks for a tenant
app.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const tenantId = c.req.query("tenant_id");

  if (!tenantId) {
    return c.json({ error: "tenant_id es requerido" }, 400);
  }

  const tenantIdNum = parseInt(tenantId);
  const hasAccess = await verifyTenantOwnership(
    c.env.DB,
    user.id,
    tenantIdNum
  );

  if (!hasAccess) {
    return c.json({ error: "No tienes acceso a este negocio" }, 403);
  }

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM social_networks WHERE tenant_id = ? ORDER BY platform ASC"
  )
    .bind(tenantIdNum)
    .all<SocialNetwork>();

  return c.json(results);
});

// Create a new social network
app.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const body = await c.req.json();

  if (!body.tenant_id || !body.platform || !body.url) {
    return c.json(
      { error: "tenant_id, platform y url son requeridos" },
      400
    );
  }

  const hasAccess = await verifyTenantOwnership(
    c.env.DB,
    user.id,
    body.tenant_id
  );

  if (!hasAccess) {
    return c.json({ error: "No tienes acceso a este negocio" }, 403);
  }

  // Check if platform already exists for this tenant
  const existing = await c.env.DB.prepare(
    "SELECT id FROM social_networks WHERE tenant_id = ? AND platform = ?"
  )
    .bind(body.tenant_id, body.platform)
    .first();

  if (existing) {
    return c.json(
      { error: "Esta red social ya está configurada para este negocio" },
      409
    );
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO social_networks (tenant_id, platform, url, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(
      body.tenant_id,
      body.platform,
      body.url,
      body.is_active !== false ? 1 : 0
    )
    .run();

  const socialNetwork = await c.env.DB.prepare(
    "SELECT * FROM social_networks WHERE id = ?"
  )
    .bind(result.meta.last_row_id)
    .first<SocialNetwork>();

  return c.json(socialNetwork, 201);
});

// Update a social network
app.put("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const networkId = parseInt(c.req.param("id"));
  const body = await c.req.json();

  // Verify ownership
  const network = await c.env.DB.prepare(
    `SELECT sn.* FROM social_networks sn
     JOIN tenants t ON sn.tenant_id = t.id
     WHERE sn.id = ? AND t.owner_user_id = ?`
  )
    .bind(networkId, user.id)
    .first<SocialNetwork>();

  if (!network) {
    return c.json({ error: "Red social no encontrada" }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.url !== undefined) {
    updates.push("url = ?");
    values.push(body.url);
  }

  if (typeof body.is_active === "boolean") {
    updates.push("is_active = ?");
    values.push(body.is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json(network);
  }

  updates.push("updated_at = datetime('now')");
  values.push(networkId);

  await c.env.DB.prepare(
    `UPDATE social_networks SET ${updates.join(", ")} WHERE id = ?`
  )
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare(
    "SELECT * FROM social_networks WHERE id = ?"
  )
    .bind(networkId)
    .first<SocialNetwork>();

  return c.json(updated);
});

// Delete a social network
app.delete("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const networkId = parseInt(c.req.param("id"));

  // Verify ownership
  const network = await c.env.DB.prepare(
    `SELECT sn.id FROM social_networks sn
     JOIN tenants t ON sn.tenant_id = t.id
     WHERE sn.id = ? AND t.owner_user_id = ?`
  )
    .bind(networkId, user.id)
    .first();

  if (!network) {
    return c.json({ error: "Red social no encontrada" }, 404);
  }

  await c.env.DB.prepare("DELETE FROM social_networks WHERE id = ?")
    .bind(networkId)
    .run();

  return c.json({ success: true });
});

export default app;

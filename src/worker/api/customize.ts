import { Hono } from "hono";
import { authMiddleware } from "@/worker/api/auth";
import type { VisualCustomization } from "@/shared/types";

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

// Get visual customization for a tenant
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

  const customization = await c.env.DB.prepare(
    "SELECT * FROM visual_customizations WHERE tenant_id = ?"
  )
    .bind(tenantIdNum)
    .first<VisualCustomization>();

  if (!customization) {
    return c.json({ error: "Personalización no encontrada" }, 404);
  }

  return c.json(customization);
});

// Update visual customization
app.put("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const body = await c.req.json();

  if (!body.tenant_id) {
    return c.json({ error: "tenant_id es requerido" }, 400);
  }

  const hasAccess = await verifyTenantOwnership(
    c.env.DB,
    user.id,
    body.tenant_id
  );

  if (!hasAccess) {
    return c.json({ error: "No tienes acceso a este negocio" }, 403);
  }

  // Check if customization exists
  const existing = await c.env.DB.prepare(
    "SELECT id FROM visual_customizations WHERE tenant_id = ?"
  )
    .bind(body.tenant_id)
    .first();

  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    "primary_color",
    "secondary_color",
    "accent_color",
    "text_color",
    "background_type",
    "background_color",
    "background_gradient_start",
    "background_gradient_end",
    "background_image_url",
    "card_background_color",
    "card_border_color",
    "service_title_color",
    "time_text_color",
    "price_color",
  ];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) {
    const customization = await c.env.DB.prepare(
      "SELECT * FROM visual_customizations WHERE tenant_id = ?"
    )
      .bind(body.tenant_id)
      .first<VisualCustomization>();
    return c.json(customization);
  }

  if (existing) {
    // Update existing
    updates.push("updated_at = datetime('now')");
    values.push(body.tenant_id);

    await c.env.DB.prepare(
      `UPDATE visual_customizations SET ${updates.join(", ")} WHERE tenant_id = ?`
    )
      .bind(...values)
      .run();
  } else {
    // Create new - need to handle all fields
    const insertFields = ["tenant_id"];
    const insertValues = [body.tenant_id];
    const insertPlaceholders = ["?"];

    for (const field of fields) {
      const value = body[field] !== undefined ? body[field] : null;
      insertFields.push(field);
      insertValues.push(value);
      insertPlaceholders.push("?");
    }

    insertFields.push("created_at", "updated_at");
    insertPlaceholders.push("datetime('now')", "datetime('now')");

    await c.env.DB.prepare(
      `INSERT INTO visual_customizations (${insertFields.join(", ")}) VALUES (${insertPlaceholders.join(", ")})`
    )
      .bind(...insertValues)
      .run();
  }

  const customization = await c.env.DB.prepare(
    "SELECT * FROM visual_customizations WHERE tenant_id = ?"
  )
    .bind(body.tenant_id)
    .first<VisualCustomization>();

  return c.json(customization);
});

export default app;

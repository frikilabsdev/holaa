import { Hono } from "hono";
import { authMiddleware } from "@/worker/api/auth";
import type { PaymentMethod } from "@/shared/types";

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

// Get all payment methods for a tenant
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
    "SELECT * FROM payment_methods WHERE tenant_id = ? ORDER BY method_type ASC"
  )
    .bind(tenantIdNum)
    .all<PaymentMethod>();

  return c.json(results);
});

// Create a new payment method
app.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const body = await c.req.json();

  if (!body.tenant_id || !body.method_type) {
    return c.json(
      { error: "tenant_id y method_type son requeridos" },
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

  // Check if method_type already exists for this tenant
  const existing = await c.env.DB.prepare(
    "SELECT id FROM payment_methods WHERE tenant_id = ? AND method_type = ?"
  )
    .bind(body.tenant_id, body.method_type)
    .first();

  if (existing) {
    return c.json(
      { error: "Este método de pago ya está configurado para este negocio" },
      409
    );
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO payment_methods (
      tenant_id, method_type, account_number, clabe, card_number, 
      account_holder_name, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(
      body.tenant_id,
      body.method_type,
      body.account_number || null,
      body.clabe || null,
      body.card_number || null,
      body.account_holder_name || null,
      body.is_active !== false ? 1 : 0
    )
    .run();

  const paymentMethod = await c.env.DB.prepare(
    "SELECT * FROM payment_methods WHERE id = ?"
  )
    .bind(result.meta.last_row_id)
    .first<PaymentMethod>();

  return c.json(paymentMethod, 201);
});

// Update a payment method
app.put("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const paymentId = parseInt(c.req.param("id"));
  const body = await c.req.json();

  // Verify ownership
  const payment = await c.env.DB.prepare(
    `SELECT pm.* FROM payment_methods pm
     JOIN tenants t ON pm.tenant_id = t.id
     WHERE pm.id = ? AND t.owner_user_id = ?`
  )
    .bind(paymentId, user.id)
    .first<PaymentMethod>();

  if (!payment) {
    return c.json({ error: "Método de pago no encontrado" }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.account_number !== undefined) {
    updates.push("account_number = ?");
    values.push(body.account_number);
  }

  if (body.clabe !== undefined) {
    updates.push("clabe = ?");
    values.push(body.clabe);
  }

  if (body.card_number !== undefined) {
    updates.push("card_number = ?");
    values.push(body.card_number);
  }

  if (body.account_holder_name !== undefined) {
    updates.push("account_holder_name = ?");
    values.push(body.account_holder_name);
  }

  if (typeof body.is_active === "boolean") {
    updates.push("is_active = ?");
    values.push(body.is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json(payment);
  }

  updates.push("updated_at = datetime('now')");
  values.push(paymentId);

  await c.env.DB.prepare(
    `UPDATE payment_methods SET ${updates.join(", ")} WHERE id = ?`
  )
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare(
    "SELECT * FROM payment_methods WHERE id = ?"
  )
    .bind(paymentId)
    .first<PaymentMethod>();

  return c.json(updated);
});

// Delete a payment method
app.delete("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const paymentId = parseInt(c.req.param("id"));

  // Verify ownership
  const payment = await c.env.DB.prepare(
    `SELECT pm.id FROM payment_methods pm
     JOIN tenants t ON pm.tenant_id = t.id
     WHERE pm.id = ? AND t.owner_user_id = ?`
  )
    .bind(paymentId, user.id)
    .first();

  if (!payment) {
    return c.json({ error: "Método de pago no encontrado" }, 404);
  }

  await c.env.DB.prepare("DELETE FROM payment_methods WHERE id = ?")
    .bind(paymentId)
    .run();

  return c.json({ success: true });
});

export default app;

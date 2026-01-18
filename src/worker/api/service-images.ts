import { Hono } from "hono";
import { authMiddleware } from "@/worker/api/auth";
import type { ServiceImage } from "@/shared/types";

const app = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

// Helper to verify service ownership
async function verifyServiceOwnership(
  db: D1Database,
  serviceId: number,
  userId: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `SELECT s.id FROM services s
       JOIN tenants t ON s.tenant_id = t.id
       WHERE s.id = ? AND t.owner_user_id = ?`
    )
    .bind(serviceId, userId)
    .first();

  return !!result;
}

// Get all images for a service
app.get("/service/:serviceId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const serviceId = parseInt(c.req.param("serviceId"));

  const hasAccess = await verifyServiceOwnership(c.env.DB, serviceId, user.id);
  if (!hasAccess) {
    return c.json({ error: "Servicio no encontrado" }, 404);
  }

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM service_images WHERE service_id = ? ORDER BY display_order ASC, created_at ASC"
  )
    .bind(serviceId)
    .all<ServiceImage>();

  return c.json(results);
});

// Create a new service image
app.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const body = await c.req.json();

  if (!body.service_id || !body.image_url) {
    return c.json({ error: "service_id e image_url son requeridos" }, 400);
  }

  const hasAccess = await verifyServiceOwnership(
    c.env.DB,
    body.service_id,
    user.id
  );
  if (!hasAccess) {
    return c.json({ error: "Servicio no encontrado" }, 404);
  }

  const displayOrder = body.display_order ?? 0;

  const result = await c.env.DB.prepare(
    `INSERT INTO service_images (service_id, image_url, display_order, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(body.service_id, body.image_url, displayOrder)
    .run();

  const image = await c.env.DB.prepare(
    "SELECT * FROM service_images WHERE id = ?"
  )
    .bind(result.meta.last_row_id)
    .first<ServiceImage>();

  return c.json(image, 201);
});

// Update a service image
app.put("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const imageId = parseInt(c.req.param("id"));
  const body = await c.req.json();

  // Get image and verify ownership
  const image = await c.env.DB.prepare(
    `SELECT si.service_id FROM service_images si
     JOIN services s ON si.service_id = s.id
     JOIN tenants t ON s.tenant_id = t.id
     WHERE si.id = ? AND t.owner_user_id = ?`
  )
    .bind(imageId, user.id)
    .first();

  if (!image) {
    return c.json({ error: "Imagen no encontrada" }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.image_url !== undefined) {
    updates.push("image_url = ?");
    values.push(body.image_url);
  }

  if (body.display_order !== undefined) {
    updates.push("display_order = ?");
    values.push(body.display_order);
  }

  if (updates.length === 0) {
    const existing = await c.env.DB.prepare(
      "SELECT * FROM service_images WHERE id = ?"
    )
      .bind(imageId)
      .first<ServiceImage>();
    return c.json(existing);
  }

  updates.push("updated_at = datetime('now')");
  values.push(imageId);

  await c.env.DB.prepare(
    `UPDATE service_images SET ${updates.join(", ")} WHERE id = ?`
  )
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare(
    "SELECT * FROM service_images WHERE id = ?"
  )
    .bind(imageId)
    .first<ServiceImage>();

  return c.json(updated);
});

// Delete a service image
app.delete("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const imageId = parseInt(c.req.param("id"));

  // Verify ownership
  const image = await c.env.DB.prepare(
    `SELECT si.id FROM service_images si
     JOIN services s ON si.service_id = s.id
     JOIN tenants t ON s.tenant_id = t.id
     WHERE si.id = ? AND t.owner_user_id = ?`
  )
    .bind(imageId, user.id)
    .first();

  if (!image) {
    return c.json({ error: "Imagen no encontrada" }, 404);
  }

  await c.env.DB.prepare("DELETE FROM service_images WHERE id = ?")
    .bind(imageId)
    .run();

  return c.json({ success: true });
});

export default app;

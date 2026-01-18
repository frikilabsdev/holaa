import { Hono } from "hono";
import { authMiddleware } from "@/worker/api/auth";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const servicesApi = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

// Validation schemas
const createServiceSchema = z.object({
  tenant_id: z.number(),
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
  price: z.number().nullable().optional(),
  duration_minutes: z.number().nullable().optional(),
  max_simultaneous_bookings: z.number().min(1).default(1),
  is_active: z.boolean().default(true),
  main_image_url: z.string().nullable().optional(),
});

const updateServiceSchema = z.object({
  title: z.string().min(1, "El título es requerido").optional(),
  description: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  duration_minutes: z.number().nullable().optional(),
  max_simultaneous_bookings: z.number().min(1).optional(),
  is_active: z.boolean().optional(),
  main_image_url: z.string().nullable().optional(),
});

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

// GET /api/services?tenant_id=X - List all services for a tenant
servicesApi.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const tenantId = c.req.query("tenant_id");

  if (!tenantId) {
    return c.json({ error: "tenant_id es requerido" }, 400);
  }

  const tenantIdNum = parseInt(tenantId);
  const hasAccess = await verifyTenantOwnership(c.env.DB, user.id, tenantIdNum);

  if (!hasAccess) {
    return c.json({ error: "No tienes acceso a este negocio" }, 403);
  }

  const services = await c.env.DB.prepare(
    "SELECT * FROM services WHERE tenant_id = ? ORDER BY created_at DESC"
  )
    .bind(tenantIdNum)
    .all();

  return c.json(services.results);
});

// GET /api/services/:id - Get a specific service
servicesApi.get("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const serviceId = parseInt(c.req.param("id"));

  const service = await c.env.DB.prepare(
    "SELECT s.*, t.owner_user_id FROM services s JOIN tenants t ON s.tenant_id = t.id WHERE s.id = ?"
  )
    .bind(serviceId)
    .first();

  if (!service) {
    return c.json({ error: "Servicio no encontrado" }, 404);
  }

  if (service.owner_user_id !== user.id) {
    return c.json({ error: "No tienes acceso a este servicio" }, 403);
  }

  return c.json(service);
});

// POST /api/services - Create a new service
servicesApi.post(
  "/",
  authMiddleware,
  zValidator("json", createServiceSchema),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "No autenticado" }, 401);
    }

    const data = c.req.valid("json");

    const hasAccess = await verifyTenantOwnership(
      c.env.DB,
      user.id,
      data.tenant_id
    );

    if (!hasAccess) {
      return c.json({ error: "No tienes acceso a este negocio" }, 403);
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO services (
        tenant_id, title, description, price, duration_minutes, 
        max_simultaneous_bookings, is_active, main_image_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        data.tenant_id,
        data.title,
        data.description || null,
        data.price ?? null,
        data.duration_minutes ?? null,
        data.max_simultaneous_bookings,
        data.is_active ? 1 : 0,
        data.main_image_url || null
      )
      .run();

    const service = await c.env.DB.prepare(
      "SELECT * FROM services WHERE id = ?"
    )
      .bind(result.meta.last_row_id)
      .first();

    return c.json(service, 201);
  }
);

// PUT /api/services/:id - Update a service
servicesApi.put(
  "/:id",
  authMiddleware,
  zValidator("json", updateServiceSchema),
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "No autenticado" }, 401);
    }

    const serviceId = parseInt(c.req.param("id"));
    const data = c.req.valid("json");

    // Check ownership
    const service = await c.env.DB.prepare(
      "SELECT s.tenant_id, t.owner_user_id FROM services s JOIN tenants t ON s.tenant_id = t.id WHERE s.id = ?"
    )
      .bind(serviceId)
      .first();

    if (!service) {
      return c.json({ error: "Servicio no encontrado" }, 404);
    }

    if (service.owner_user_id !== user.id) {
      return c.json({ error: "No tienes acceso a este servicio" }, 403);
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) {
      updates.push("title = ?");
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push("description = ?");
      values.push(data.description);
    }
    if (data.price !== undefined) {
      updates.push("price = ?");
      values.push(data.price);
    }
    if (data.duration_minutes !== undefined) {
      updates.push("duration_minutes = ?");
      values.push(data.duration_minutes);
    }
    if (data.max_simultaneous_bookings !== undefined) {
      updates.push("max_simultaneous_bookings = ?");
      values.push(data.max_simultaneous_bookings);
    }
    if (data.is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(data.is_active ? 1 : 0);
    }
    if (data.main_image_url !== undefined) {
      updates.push("main_image_url = ?");
      values.push(data.main_image_url || null);
    }

    updates.push("updated_at = datetime('now')");
    values.push(serviceId);

    await c.env.DB.prepare(
      `UPDATE services SET ${updates.join(", ")} WHERE id = ?`
    )
      .bind(...values)
      .run();

    const updated = await c.env.DB.prepare(
      "SELECT * FROM services WHERE id = ?"
    )
      .bind(serviceId)
      .first();

    return c.json(updated);
  }
);

// DELETE /api/services/:id - Delete a service
servicesApi.delete("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const serviceId = parseInt(c.req.param("id"));

  // Check ownership
  const service = await c.env.DB.prepare(
    "SELECT s.tenant_id, t.owner_user_id FROM services s JOIN tenants t ON s.tenant_id = t.id WHERE s.id = ?"
  )
    .bind(serviceId)
    .first();

  if (!service) {
    return c.json({ error: "Servicio no encontrado" }, 404);
  }

  if (service.owner_user_id !== user.id) {
    return c.json({ error: "No tienes acceso a este servicio" }, 403);
  }

  // Delete related availability schedules first
  await c.env.DB.prepare(
    "DELETE FROM availability_schedules WHERE service_id = ?"
  )
    .bind(serviceId)
    .run();

  // Delete service images
  await c.env.DB.prepare("DELETE FROM service_images WHERE service_id = ?")
    .bind(serviceId)
    .run();

  // Delete the service
  await c.env.DB.prepare("DELETE FROM services WHERE id = ?")
    .bind(serviceId)
    .run();

  return c.json({ message: "Servicio eliminado" });
});

export default servicesApi;

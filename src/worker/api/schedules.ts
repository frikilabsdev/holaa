import { Hono } from "hono";
import { authMiddleware } from "@/worker/api/auth";
import type { AvailabilitySchedule, ScheduleException } from "@/shared/types";

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

// Helper to verify tenant ownership
async function verifyTenantOwnership(
  db: D1Database,
  tenantId: number,
  userId: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `SELECT id FROM tenants WHERE id = ? AND owner_user_id = ?`
    )
    .bind(tenantId, userId)
    .first();

  return !!result;
}

// Get all schedules for a service
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
    "SELECT * FROM availability_schedules WHERE service_id = ? ORDER BY day_of_week, start_time"
  )
    .bind(serviceId)
    .all<AvailabilitySchedule>();

  return c.json(results);
});

// Get all schedules for a tenant (across all services) for a specific day
app.get("/tenant/:tenantId/day/:dayOfWeek", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const tenantId = parseInt(c.req.param("tenantId"));
  const dayOfWeek = parseInt(c.req.param("dayOfWeek"));

  const hasAccess = await verifyTenantOwnership(c.env.DB, tenantId, user.id);
  if (!hasAccess) {
    return c.json({ error: "No autorizado" }, 403);
  }

  // Get all schedules for this day across all services of the tenant
  const { results } = await c.env.DB.prepare(
    `SELECT s.* 
     FROM availability_schedules s
     JOIN services sv ON s.service_id = sv.id
     WHERE sv.tenant_id = ? 
       AND s.day_of_week = ? 
       AND s.is_active = 1
     ORDER BY s.start_time`
  )
    .bind(tenantId, dayOfWeek)
    .all<AvailabilitySchedule>();

  return c.json(results);
});

// Create a new schedule
app.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const body = await c.req.json();

  if (!body.service_id || body.day_of_week === undefined || !body.start_time || !body.end_time) {
    return c.json({ error: "Campos requeridos faltantes" }, 400);
  }

  const hasAccess = await verifyServiceOwnership(
    c.env.DB,
    body.service_id,
    user.id
  );
  if (!hasAccess) {
    return c.json({ error: "Servicio no encontrado" }, 404);
  }

  // Validate day_of_week (0-6)
  if (body.day_of_week < 0 || body.day_of_week > 6) {
    return c.json({ error: "Día de la semana inválido" }, 400);
  }

  // Validate time format (HH:MM)
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(body.start_time) || !timeRegex.test(body.end_time)) {
    return c.json({ error: "Formato de hora inválido (usar HH:MM)" }, 400);
  }

  // Validate start_time < end_time
  if (body.start_time >= body.end_time) {
    return c.json({ error: "La hora de inicio debe ser menor a la hora de fin" }, 400);
  }

  // Get service to get tenant_id
  const service = await c.env.DB.prepare(
    "SELECT tenant_id FROM services WHERE id = ?"
  )
    .bind(body.service_id)
    .first<{ tenant_id: number }>();

  if (!service) {
    return c.json({ error: "Servicio no encontrado" }, 404);
  }

  // Check for overlapping schedules across ALL services of the tenant (resources are shared)
  // Get all schedules for the same day_of_week from all services of this tenant
  const { results: existingSchedules } = await c.env.DB.prepare(
    `SELECT s.* 
     FROM availability_schedules s
     JOIN services sv ON s.service_id = sv.id
     WHERE sv.tenant_id = ? 
       AND s.day_of_week = ? 
       AND s.is_active = 1`
  )
    .bind(service.tenant_id, body.day_of_week)
    .all<AvailabilitySchedule>();

  // Helper function to convert time to minutes
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  // Helper function to check overlap
  const timeRangesOverlap = (
    start1: number,
    end1: number,
    start2: number,
    end2: number
  ): boolean => {
    return start1 < end2 && end1 > start2;
  };

  const newStartMinutes = timeToMinutes(body.start_time);
  const newEndMinutes = timeToMinutes(body.end_time);

  // Check if new schedule overlaps with any existing schedule
  for (const existing of existingSchedules) {
    const existingStartMinutes = timeToMinutes(existing.start_time);
    const existingEndMinutes = timeToMinutes(existing.end_time);

    if (timeRangesOverlap(
      newStartMinutes,
      newEndMinutes,
      existingStartMinutes,
      existingEndMinutes
    )) {
      return c.json({ 
        error: `Este horario se solapa con otro horario existente (${existing.start_time} - ${existing.end_time})` 
      }, 409);
    }
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO availability_schedules (service_id, day_of_week, start_time, end_time, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
  )
    .bind(body.service_id, body.day_of_week, body.start_time, body.end_time)
    .run();

  const schedule = await c.env.DB.prepare(
    "SELECT * FROM availability_schedules WHERE id = ?"
  )
    .bind(result.meta.last_row_id)
    .first<AvailabilitySchedule>();

  return c.json(schedule, 201);
});

// Update a schedule
app.put("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const scheduleId = parseInt(c.req.param("id"));
  const body = await c.req.json();

  // Get schedule and verify ownership
  const schedule = await c.env.DB.prepare(
    "SELECT * FROM availability_schedules WHERE id = ?"
  )
    .bind(scheduleId)
    .first<AvailabilitySchedule>();

  if (!schedule) {
    return c.json({ error: "Horario no encontrado" }, 404);
  }

  const hasAccess = await verifyServiceOwnership(
    c.env.DB,
    schedule.service_id,
    user.id
  );
  if (!hasAccess) {
    return c.json({ error: "No autorizado" }, 403);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.day_of_week !== undefined) {
    if (body.day_of_week < 0 || body.day_of_week > 6) {
      return c.json({ error: "Día de la semana inválido" }, 400);
    }
    updates.push("day_of_week = ?");
    values.push(body.day_of_week);
  }

  if (body.start_time) {
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(body.start_time)) {
      return c.json({ error: "Formato de hora inválido (usar HH:MM)" }, 400);
    }
    updates.push("start_time = ?");
    values.push(body.start_time);
  }

  if (body.end_time) {
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(body.end_time)) {
      return c.json({ error: "Formato de hora inválido (usar HH:MM)" }, 400);
    }
    updates.push("end_time = ?");
    values.push(body.end_time);
  }

  if (typeof body.is_active === "boolean") {
    updates.push("is_active = ?");
    values.push(body.is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json(schedule);
  }

  updates.push("updated_at = datetime('now')");
  values.push(scheduleId);

  await c.env.DB.prepare(
    `UPDATE availability_schedules SET ${updates.join(", ")} WHERE id = ?`
  )
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare(
    "SELECT * FROM availability_schedules WHERE id = ?"
  )
    .bind(scheduleId)
    .first<AvailabilitySchedule>();

  return c.json(updated);
});

// Delete a schedule
app.delete("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const scheduleId = parseInt(c.req.param("id"));

  // Get schedule and verify ownership
  const schedule = await c.env.DB.prepare(
    "SELECT * FROM availability_schedules WHERE id = ?"
  )
    .bind(scheduleId)
    .first<AvailabilitySchedule>();

  if (!schedule) {
    return c.json({ error: "Horario no encontrado" }, 404);
  }

  const hasAccess = await verifyServiceOwnership(
    c.env.DB,
    schedule.service_id,
    user.id
  );
  if (!hasAccess) {
    return c.json({ error: "No autorizado" }, 403);
  }

  await c.env.DB.prepare("DELETE FROM availability_schedules WHERE id = ?")
    .bind(scheduleId)
    .run();

  return c.json({ success: true });
});

// ============ Schedule Exceptions (Bloqueos/Excepciones) ============

// Get all exceptions for a tenant
app.get("/exceptions/tenant/:tenantId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const tenantId = parseInt(c.req.param("tenantId"));
  const serviceIdParam = c.req.query("service_id");

  // Verify tenant ownership
  const hasAccess = await verifyTenantOwnership(c.env.DB, tenantId, user.id);
  if (!hasAccess) {
    return c.json({ error: "No autorizado" }, 403);
  }

  let query = "SELECT * FROM schedule_exceptions WHERE tenant_id = ?";
  const bindValues: any[] = [tenantId];

  if (serviceIdParam) {
    query += " AND (service_id = ? OR service_id IS NULL)";
    bindValues.push(parseInt(serviceIdParam));
  }

  query += " ORDER BY exception_date DESC, start_time ASC";

  const { results } = await c.env.DB.prepare(query)
    .bind(...bindValues)
    .all<ScheduleException>();

  return c.json(results);
});

// Create a new exception
app.post("/exceptions", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const body = await c.req.json();

  if (!body.tenant_id || !body.exception_date) {
    return c.json({ error: "Campos requeridos: tenant_id, exception_date" }, 400);
  }

  // Verify tenant ownership
  const hasAccess = await verifyTenantOwnership(c.env.DB, body.tenant_id, user.id);
  if (!hasAccess) {
    return c.json({ error: "No autorizado" }, 403);
  }

  // Verify service ownership if service_id is provided
  if (body.service_id) {
    const serviceAccess = await verifyServiceOwnership(c.env.DB, body.service_id, user.id);
    if (!serviceAccess) {
      return c.json({ error: "No autorizado para este servicio" }, 403);
    }
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO schedule_exceptions (
      tenant_id, service_id, exception_date, start_time, end_time, is_blocked, reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(
      body.tenant_id,
      body.service_id || null,
      body.exception_date,
      body.start_time || null,
      body.end_time || null,
      body.is_blocked !== undefined ? body.is_blocked : 1,
      body.reason || null
    )
    .run();

  const exception = await c.env.DB.prepare(
    "SELECT * FROM schedule_exceptions WHERE id = ?"
  )
    .bind(result.meta.last_row_id)
    .first<ScheduleException>();

  return c.json(exception, 201);
});

// Update an exception
app.put("/exceptions/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const exceptionId = parseInt(c.req.param("id"));
  const body = await c.req.json();

  // Get exception and verify ownership
  const exception = await c.env.DB.prepare(
    "SELECT * FROM schedule_exceptions WHERE id = ?"
  )
    .bind(exceptionId)
    .first<ScheduleException>();

  if (!exception) {
    return c.json({ error: "Excepción no encontrada" }, 404);
  }

  const hasAccess = await verifyTenantOwnership(c.env.DB, exception.tenant_id, user.id);
  if (!hasAccess) {
    return c.json({ error: "No autorizado" }, 403);
  }

  // Update only provided fields
  const updates: string[] = [];
  const values: any[] = [];

  if (body.exception_date !== undefined) {
    updates.push("exception_date = ?");
    values.push(body.exception_date);
  }
  if (body.start_time !== undefined) {
    updates.push("start_time = ?");
    values.push(body.start_time || null);
  }
  if (body.end_time !== undefined) {
    updates.push("end_time = ?");
    values.push(body.end_time || null);
  }
  if (body.is_blocked !== undefined) {
    updates.push("is_blocked = ?");
    values.push(body.is_blocked ? 1 : 0);
  }
  if (body.reason !== undefined) {
    updates.push("reason = ?");
    values.push(body.reason || null);
  }
  if (body.service_id !== undefined) {
    // Verify service ownership if service_id is provided
    if (body.service_id !== null) {
      const serviceAccess = await verifyServiceOwnership(c.env.DB, body.service_id, user.id);
      if (!serviceAccess) {
        return c.json({ error: "No autorizado para este servicio" }, 403);
      }
    }
    updates.push("service_id = ?");
    values.push(body.service_id || null);
  }

  if (updates.length === 0) {
    return c.json(exception);
  }

  updates.push("updated_at = datetime('now')");
  values.push(exceptionId);

  await c.env.DB.prepare(
    `UPDATE schedule_exceptions SET ${updates.join(", ")} WHERE id = ?`
  )
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare(
    "SELECT * FROM schedule_exceptions WHERE id = ?"
  )
    .bind(exceptionId)
    .first<ScheduleException>();

  return c.json(updated);
});

// Delete an exception
app.delete("/exceptions/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const exceptionId = parseInt(c.req.param("id"));

  // Get exception and verify ownership
  const exception = await c.env.DB.prepare(
    "SELECT * FROM schedule_exceptions WHERE id = ?"
  )
    .bind(exceptionId)
    .first<ScheduleException>();

  if (!exception) {
    return c.json({ error: "Excepción no encontrada" }, 404);
  }

  const hasAccess = await verifyTenantOwnership(c.env.DB, exception.tenant_id, user.id);
  if (!hasAccess) {
    return c.json({ error: "No autorizado" }, 403);
  }

  await c.env.DB.prepare("DELETE FROM schedule_exceptions WHERE id = ?")
    .bind(exceptionId)
    .run();

  return c.json({ success: true });
});

export default app;

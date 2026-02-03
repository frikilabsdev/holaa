import { Hono } from "hono";
import { authMiddleware } from "@/worker/api/auth";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Employee, EmployeeSchedule, EmployeeTimeOff } from "@/shared/types";
import { logger } from "@/worker/utils/logger";

const app = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

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

async function verifyEmployeeOwnership(
  db: D1Database,
  userId: string,
  employeeId: number
): Promise<{ employee: { id: number; tenant_id: number }; ok: boolean }> {
  const employee = await db
    .prepare(
      "SELECT e.id, e.tenant_id FROM employees e JOIN tenants t ON e.tenant_id = t.id WHERE e.id = ? AND t.owner_user_id = ?"
    )
    .bind(employeeId, userId)
    .first<{ id: number; tenant_id: number }>();
  return { employee: employee as { id: number; tenant_id: number }, ok: !!employee };
}

const createEmployeeSchema = z.object({
  tenant_id: z.number(),
  name: z.string().min(1, "El nombre es requerido"),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  is_active: z.boolean().default(true),
  display_order: z.number().default(0),
});

const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  is_active: z.boolean().optional(),
  display_order: z.number().optional(),
});

const createScheduleSchema = z.object({
  day_of_week: z.number().min(0).max(6),
  start_time: z.string().regex(/^\d{1,2}:\d{2}$/),
  end_time: z.string().regex(/^\d{1,2}:\d{2}$/),
  is_active: z.boolean().default(true),
});

const createTimeOffSchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().nullable().optional(),
});

// GET /api/employees?tenant_id=X
app.get("/", authMiddleware, async (c) => {
  try {
    if (!c.env.DB) {
      logger.error("GET /api/employees: DB binding missing", undefined, { path: c.req.path });
      return c.json({ error: "Error al cargar empleados", message: "DB no configurado" }, 503);
    }

    const user = c.get("user");
    if (!user) return c.json({ error: "No autenticado" }, 401);

    const tenantIdParam = c.req.query("tenant_id");
    if (!tenantIdParam) return c.json({ error: "tenant_id es requerido" }, 400);

    const tenantId = parseInt(tenantIdParam);
    if (isNaN(tenantId)) return c.json({ error: "tenant_id inválido" }, 400);

    const hasAccess = await verifyTenantOwnership(c.env.DB, user.id, tenantId);
    if (!hasAccess) return c.json({ error: "No tienes acceso a este negocio" }, 403);

    const raw = await c.env.DB.prepare(
      "SELECT * FROM employees WHERE tenant_id = ? ORDER BY display_order ASC, name ASC"
    )
      .bind(tenantId)
      .all<Record<string, unknown>>();

    const employees = Array.isArray(raw?.results) ? raw.results : [];
    if (!employees.length) return c.json([]);

    const empIds = employees.map((e) => e.id as number);
    const placeholders = empIds.map(() => "?").join(",");
    let serviceIdsByEmployee: Record<number, number[]> = {};
    try {
      const linksRaw = await c.env.DB.prepare(
        `SELECT employee_id, service_id FROM employee_services WHERE employee_id IN (${placeholders})`
      )
        .bind(...empIds)
        .all<{ employee_id: number; service_id: number }>();
      const links = Array.isArray(linksRaw?.results) ? linksRaw.results : [];
      for (const link of links) {
        if (!serviceIdsByEmployee[link.employee_id]) serviceIdsByEmployee[link.employee_id] = [];
        serviceIdsByEmployee[link.employee_id].push(link.service_id);
      }
    } catch {
      // employee_services puede no existir
    }

    const list = employees.map((e) => ({
      ...e,
      is_active: Boolean(e.is_active),
      service_ids: serviceIdsByEmployee[e.id as number] || [],
    }));

    return c.json(list);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isMissingTable =
      /no such table:\s*employees/i.test(msg) ||
      /no such table:\s*employee_/i.test(msg);
    if (isMissingTable) {
      logger.warn("GET /api/employees: tablas de empleados no existen, devolviendo lista vacía", {
        message: msg,
      });
      return c.json([]);
    }
    logger.error("GET /api/employees", err, { path: c.req.path });
    // Incluir message en 500 para poder ver causa en Network (quitar en producción si no se desea exponer)
    return c.json(
      { error: "Error al cargar empleados", message: msg },
      500
    );
  }
});

// POST /api/employees
app.post(
  "/",
  authMiddleware,
  zValidator("json", createEmployeeSchema),
  async (c) => {
    try {
      if (!c.env.DB) {
        logger.error("POST /api/employees: DB binding missing", undefined, { path: c.req.path });
        return c.json({ error: "Error al crear empleado", message: "DB no configurado" }, 503);
      }

      const user = c.get("user");
      if (!user) return c.json({ error: "No autenticado" }, 401);

      const data = c.req.valid("json");
      const hasAccess = await verifyTenantOwnership(c.env.DB, user.id, data.tenant_id);
      if (!hasAccess) return c.json({ error: "No tienes acceso a este negocio" }, 403);

      const result = await c.env.DB.prepare(
        `INSERT INTO employees (tenant_id, name, phone, email, is_active, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
        .bind(
          data.tenant_id,
          data.name,
          data.phone ?? null,
          data.email === "" ? null : data.email ?? null,
          data.is_active ? 1 : 0,
          data.display_order
        )
        .run();

      const id = result.meta?.last_row_id;
      if (id == null) {
        logger.warn("POST /api/employees: INSERT ok but no last_row_id", {});
        return c.json(
          { error: "Error al crear empleado", message: "last_row_id no devuelto por D1" },
          500
        );
      }

      const row = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?")
        .bind(id)
        .first<Employee>();

      return c.json(row ?? { id, ...data }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("POST /api/employees", err, { path: c.req.path });
      // Incluir message en 500 para poder ver causa en Network
      return c.json(
        { error: "Error al crear empleado", message: msg },
        500
      );
    }
  }
);

// GET /api/employees/:id
app.get("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "No autenticado" }, 401);

  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "ID inválido" }, 400);

  const { ok } = await verifyEmployeeOwnership(c.env.DB, user.id, id);
  if (!ok) return c.json({ error: "Empleado no encontrado" }, 404);

  try {
    const emp = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?")
      .bind(id)
      .first<Employee>();

    if (!emp) return c.json({ error: "Empleado no encontrado" }, 404);

    const { results: serviceLinks } = await c.env.DB.prepare(
      "SELECT service_id FROM employee_services WHERE employee_id = ?"
    )
      .bind(id)
      .all<{ service_id: number }>();

    const { results: schedules } = await c.env.DB.prepare(
      "SELECT * FROM employee_schedules WHERE employee_id = ? ORDER BY day_of_week, start_time"
    )
      .bind(id)
      .all<EmployeeSchedule>();

    const { results: timeOff } = await c.env.DB.prepare(
      "SELECT * FROM employee_time_off WHERE employee_id = ? ORDER BY date_from DESC"
    )
      .bind(id)
      .all<EmployeeTimeOff>();

    return c.json({
      ...emp,
      is_active: Boolean(emp.is_active),
      service_ids: (serviceLinks || []).map((l) => l.service_id),
      schedules: schedules || [],
      time_off: timeOff || [],
    });
  } catch {
    return c.json({ error: "Empleado no encontrado" }, 404);
  }
});

// PUT /api/employees/:id
app.put(
  "/:id",
  authMiddleware,
  zValidator("json", updateEmployeeSchema),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "No autenticado" }, 401);

    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "ID inválido" }, 400);

    const { ok } = await verifyEmployeeOwnership(c.env.DB, user.id, id);
    if (!ok) return c.json({ error: "Empleado no encontrado" }, 404);

    const data = c.req.valid("json");

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      updates.push("name = ?");
      values.push(data.name);
    }
    if (data.phone !== undefined) {
      updates.push("phone = ?");
      values.push(data.phone);
    }
    if (data.email !== undefined) {
      updates.push("email = ?");
      values.push(data.email === "" ? null : data.email);
    }
    if (data.is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(data.is_active ? 1 : 0);
    }
    if (data.display_order !== undefined) {
      updates.push("display_order = ?");
      values.push(data.display_order);
    }

    if (updates.length === 0) {
      const emp = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first<Employee>();
      return c.json(emp);
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    await c.env.DB.prepare(
      `UPDATE employees SET ${updates.join(", ")} WHERE id = ?`
    )
      .bind(...values)
      .run();

    const emp = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first<Employee>();
    return c.json(emp);
  }
);

// DELETE /api/employees/:id
app.delete("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "No autenticado" }, 401);

  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "ID inválido" }, 400);

  const { ok } = await verifyEmployeeOwnership(c.env.DB, user.id, id);
  if (!ok) return c.json({ error: "Empleado no encontrado" }, 404);

  try {
    await c.env.DB.prepare("DELETE FROM employees WHERE id = ?").bind(id).run();
    return c.json({ message: "Empleado eliminado" });
  } catch {
    return c.json({ error: "Error al eliminar" }, 500);
  }
});

// PUT /api/employees/:id/services — body: { service_ids: number[] }
app.put("/:id/services", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "No autenticado" }, 401);

  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "ID inválido" }, 400);

  const { ok } = await verifyEmployeeOwnership(c.env.DB, user.id, id);
  if (!ok) return c.json({ error: "Empleado no encontrado" }, 404);

  const body = await c.req.json();
  const serviceIds = Array.isArray(body.service_ids) ? body.service_ids.map((x: unknown) => Number(x)).filter((n: number) => !isNaN(n)) : [];

  try {
    await c.env.DB.prepare("DELETE FROM employee_services WHERE employee_id = ?").bind(id).run();
    for (const sid of serviceIds) {
      await c.env.DB.prepare(
        "INSERT INTO employee_services (employee_id, service_id) VALUES (?, ?)"
      )
        .bind(id, sid)
        .run();
    }
    return c.json({ service_ids: serviceIds });
  } catch {
    return c.json({ error: "Error al actualizar servicios" }, 500);
  }
});

// GET /api/employees/:id/schedules
app.get("/:id/schedules", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "No autenticado" }, 401);

  const id = parseInt(c.req.param("id"));
  const { ok } = await verifyEmployeeOwnership(c.env.DB, user.id, id);
  if (!ok) return c.json({ error: "Empleado no encontrado" }, 404);

  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM employee_schedules WHERE employee_id = ? ORDER BY day_of_week, start_time"
    )
      .bind(id)
      .all<EmployeeSchedule>();
    return c.json(results || []);
  } catch {
    return c.json([]);
  }
});

// POST /api/employees/:id/schedules
app.post(
  "/:id/schedules",
  authMiddleware,
  zValidator("json", createScheduleSchema),
  async (c) => {
    if (!c.env.DB) {
      logger.error("POST /api/employees/:id/schedules: DB binding missing", undefined, { path: c.req.path });
      return c.json({ error: "Error al crear horario", message: "DB no configurado" }, 503);
    }

    const user = c.get("user");
    if (!user) return c.json({ error: "No autenticado" }, 401);

    const id = parseInt(c.req.param("id"));
    const { ok } = await verifyEmployeeOwnership(c.env.DB, user.id, id);
    if (!ok) return c.json({ error: "Empleado no encontrado" }, 404);

    const data = c.req.valid("json");
    try {
      const result = await c.env.DB.prepare(
        `INSERT INTO employee_schedules (employee_id, day_of_week, start_time, end_time, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
        .bind(id, data.day_of_week, data.start_time, data.end_time, data.is_active ? 1 : 0)
        .run();

      const rowId = result.meta?.last_row_id;
      const row = rowId != null
        ? await c.env.DB.prepare("SELECT * FROM employee_schedules WHERE id = ?").bind(rowId).first<EmployeeSchedule>()
        : null;
      return c.json(row ?? { id: rowId, employee_id: id, ...data }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("POST /api/employees/:id/schedules", err, { path: c.req.path });
      return c.json({ error: "Error al crear horario", message: msg }, 500);
    }
  }
);

// DELETE /api/employees/:id/schedules/:scheduleId
app.delete("/:id/schedules/:scheduleId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "No autenticado" }, 401);

  const id = parseInt(c.req.param("id"));
  const scheduleId = parseInt(c.req.param("scheduleId"));
  const { ok } = await verifyEmployeeOwnership(c.env.DB, user.id, id);
  if (!ok) return c.json({ error: "Empleado no encontrado" }, 404);

  try {
    await c.env.DB.prepare(
      "DELETE FROM employee_schedules WHERE id = ? AND employee_id = ?"
    )
      .bind(scheduleId, id)
      .run();
    return c.json({ message: "Horario eliminado" });
  } catch {
    return c.json({ error: "Error al eliminar" }, 500);
  }
});

// GET /api/employees/:id/time-off
app.get("/:id/time-off", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "No autenticado" }, 401);

  const id = parseInt(c.req.param("id"));
  const { ok } = await verifyEmployeeOwnership(c.env.DB, user.id, id);
  if (!ok) return c.json({ error: "Empleado no encontrado" }, 404);

  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM employee_time_off WHERE employee_id = ? ORDER BY date_from DESC"
    )
      .bind(id)
      .all<EmployeeTimeOff>();
    return c.json(results || []);
  } catch {
    return c.json([]);
  }
});

// POST /api/employees/:id/time-off
app.post(
  "/:id/time-off",
  authMiddleware,
  zValidator("json", createTimeOffSchema),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "No autenticado" }, 401);

    const id = parseInt(c.req.param("id"));
    const { ok } = await verifyEmployeeOwnership(c.env.DB, user.id, id);
    if (!ok) return c.json({ error: "Empleado no encontrado" }, 404);

    const data = c.req.valid("json");
    if (data.date_from > data.date_to) {
      return c.json({ error: "date_from no puede ser mayor que date_to" }, 400);
    }

    try {
      const result = await c.env.DB.prepare(
        `INSERT INTO employee_time_off (employee_id, date_from, date_to, reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
        .bind(id, data.date_from, data.date_to, data.reason ?? null)
        .run();

      const rowId = result.meta?.last_row_id;
      const row = rowId != null
        ? await c.env.DB.prepare("SELECT * FROM employee_time_off WHERE id = ?").bind(rowId).first<EmployeeTimeOff>()
        : null;
      return c.json(row ?? { id: rowId, employee_id: id, ...data }, 201);
    } catch {
      return c.json({ error: "Error al registrar ausencia" }, 500);
    }
  }
);

// DELETE /api/employees/:id/time-off/:timeOffId
app.delete("/:id/time-off/:timeOffId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "No autenticado" }, 401);

  const id = parseInt(c.req.param("id"));
  const timeOffId = parseInt(c.req.param("timeOffId"));
  const { ok } = await verifyEmployeeOwnership(c.env.DB, user.id, id);
  if (!ok) return c.json({ error: "Empleado no encontrado" }, 404);

  try {
    await c.env.DB.prepare(
      "DELETE FROM employee_time_off WHERE id = ? AND employee_id = ?"
    )
      .bind(timeOffId, id)
      .run();
    return c.json({ message: "Ausencia eliminada" });
  } catch {
    return c.json({ error: "Error al eliminar" }, 500);
  }
});

export default app;

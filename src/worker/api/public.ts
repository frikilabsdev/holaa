import { Hono } from "hono";
import type { Tenant, BusinessConfig, Service, PaymentMethod, ServiceImage } from "@/shared/types";
import { generateICS } from "@/worker/utils/ics";
import { checkRateLimit, getClientIP } from "@/worker/utils/rate-limit";

const app = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

// Helper functions
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeRangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean {
  return start1 < end2 && end1 > start2;
}

// Get public tenant data by slug
app.get("/tenants/:slug", async (c) => {
  const slug = c.req.param("slug");

  const tenant = await c.env.DB.prepare(
    "SELECT id, slug, is_active FROM tenants WHERE slug = ? AND is_active = 1"
  )
    .bind(slug)
    .first<Tenant>();

  if (!tenant) {
    return c.json({ error: "Negocio no encontrado" }, 404);
  }

  const config = await c.env.DB.prepare(
    "SELECT * FROM business_configs WHERE tenant_id = ?"
  )
    .bind(tenant.id)
    .first<BusinessConfig>();

  // Get visual customization
  const customization = await c.env.DB.prepare(
    "SELECT * FROM visual_customizations WHERE tenant_id = ?"
  )
    .bind(tenant.id)
    .first();

  // Get active social networks
  const { results: socialNetworks } = await c.env.DB.prepare(
    "SELECT * FROM social_networks WHERE tenant_id = ? AND is_active = 1 ORDER BY platform ASC"
  )
    .bind(tenant.id)
    .all();

  return c.json({
    tenant,
    config,
    customization: customization || null,
    social_networks: socialNetworks || [],
  });
});

// Get active services for a tenant
app.get("/tenants/:slug/services", async (c) => {
  const slug = c.req.param("slug");

  const tenant = await c.env.DB.prepare(
    "SELECT id FROM tenants WHERE slug = ? AND is_active = 1"
  )
    .bind(slug)
    .first<Tenant>();

  if (!tenant) {
    return c.json({ error: "Negocio no encontrado" }, 404);
  }

  const { results: services } = await c.env.DB.prepare(
    "SELECT * FROM services WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at DESC"
  )
    .bind(tenant.id)
    .all<Service>();

  if (!services?.length) {
    return c.json([]);
  }

  let variantsByServiceId: Record<number, { id: number; service_id: number; name: string; price: number; duration_minutes: number | null; display_order: number }[]> = {};
  try {
    const ids = services.map((s) => s.id);
    const placeholders = ids.map(() => "?").join(",");
    const { results: variants } = await c.env.DB.prepare(
      `SELECT * FROM service_variants WHERE service_id IN (${placeholders}) ORDER BY service_id, display_order ASC, id ASC`
    )
      .bind(...ids)
      .all<{ id: number; service_id: number; name: string; price: number; duration_minutes: number | null; display_order: number }>();
    for (const v of variants || []) {
      if (!variantsByServiceId[v.service_id]) variantsByServiceId[v.service_id] = [];
      variantsByServiceId[v.service_id].push(v);
    }
  } catch {
    // Tabla service_variants puede no existir si no se aplicó la migración 6
  }

  const servicesWithVariants = services.map((s) => ({
    ...s,
    variants: variantsByServiceId[s.id] || [],
  }));

  return c.json(servicesWithVariants);
});

// Get employees that can perform a service (for public booking)
app.get("/tenants/:slug/services/:serviceId/employees", async (c) => {
  const slug = c.req.param("slug");
  const serviceId = parseInt(c.req.param("serviceId"));
  if (isNaN(serviceId)) return c.json({ error: "Servicio inválido" }, 400);

  const tenant = await c.env.DB.prepare(
    "SELECT id FROM tenants WHERE slug = ? AND is_active = 1"
  )
    .bind(slug)
    .first<{ id: number }>();

  if (!tenant) return c.json({ error: "Negocio no encontrado" }, 404);

  try {
    const { results: rows } = await c.env.DB.prepare(
      `SELECT e.id, e.name, e.phone, e.email
       FROM employees e
       INNER JOIN employee_services es ON es.employee_id = e.id
       WHERE e.tenant_id = ? AND e.is_active = 1 AND es.service_id = ?
       ORDER BY e.display_order ASC, e.name ASC`
    )
      .bind(tenant.id, serviceId)
      .all<{ id: number; name: string; phone: string | null; email: string | null }>();

    return c.json(rows || []);
  } catch {
    return c.json([]);
  }
});

// Get weekly schedule for an employee (public, for display in booking)
app.get("/tenants/:slug/services/:serviceId/employees/:employeeId/schedules", async (c) => {
  const slug = c.req.param("slug");
  const serviceId = parseInt(c.req.param("serviceId"));
  const employeeId = parseInt(c.req.param("employeeId"));
  if (isNaN(serviceId) || isNaN(employeeId)) return c.json({ error: "Parámetros inválidos" }, 400);

  const tenant = await c.env.DB.prepare(
    "SELECT id FROM tenants WHERE slug = ? AND is_active = 1"
  )
    .bind(slug)
    .first<{ id: number }>();

  if (!tenant) return c.json({ error: "Negocio no encontrado" }, 404);

  const canDo = await c.env.DB.prepare(
    "SELECT 1 FROM employees e INNER JOIN employee_services es ON es.employee_id = e.id WHERE e.id = ? AND e.tenant_id = ? AND e.is_active = 1 AND es.service_id = ?"
  )
    .bind(employeeId, tenant.id, serviceId)
    .first();
  if (!canDo) return c.json({ error: "Empleado no encontrado o no realiza este servicio" }, 404);

  try {
    const { results } = await c.env.DB.prepare(
      "SELECT day_of_week, start_time, end_time FROM employee_schedules WHERE employee_id = ? AND is_active = 1 ORDER BY day_of_week, start_time"
    )
      .bind(employeeId)
      .all<{ day_of_week: number; start_time: string; end_time: string }>();
    return c.json(results || []);
  } catch {
    return c.json([]);
  }
});

// Get active payment methods for a tenant
app.get("/tenants/:slug/payment-methods", async (c) => {
  const slug = c.req.param("slug");

  const tenant = await c.env.DB.prepare(
    "SELECT id FROM tenants WHERE slug = ? AND is_active = 1"
  )
    .bind(slug)
    .first<Tenant>();

  if (!tenant) {
    return c.json({ error: "Negocio no encontrado" }, 404);
  }

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM payment_methods WHERE tenant_id = ? AND is_active = 1 ORDER BY method_type ASC"
  )
    .bind(tenant.id)
    .all<PaymentMethod>();

  return c.json(results);
});

// Get service images (public endpoint)
app.get("/services/:serviceId/images", async (c) => {
  const serviceId = parseInt(c.req.param("serviceId"));

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM service_images WHERE service_id = ? ORDER BY display_order ASC, created_at ASC"
  )
    .bind(serviceId)
    .all<ServiceImage>();

  return c.json(results || []);
});

// Get available dates for a service (dates that have schedules)
// Optional query: service_variant_id — if set, use variant's duration; employee_id — if set, use employee schedules
app.get("/services/:serviceId/available-dates", async (c) => {
  if (!c.env.DB) {
    return c.json(
      { error: "Error al obtener fechas disponibles", message: "Base de datos no configurada" },
      500
    );
  }
  try {
    const serviceId = parseInt(c.req.param("serviceId"), 10);
    if (isNaN(serviceId)) {
      return c.json({ error: "ID de servicio inválido" }, 400);
    }
    const variantIdParam = c.req.query("service_variant_id");
    const variantId = variantIdParam ? parseInt(variantIdParam, 10) : null;
    const employeeIdParam = c.req.query("employee_id");
    const employeeId = employeeIdParam ? parseInt(employeeIdParam, 10) : null;

    const service = await c.env.DB.prepare(
      "SELECT tenant_id, duration_minutes FROM services WHERE id = ? AND is_active = 1"
    )
      .bind(serviceId)
      .first<{ tenant_id: number; duration_minutes: number | null }>();

    if (!service) {
      return c.json({ error: "Servicio no encontrado" }, 404);
    }

    if (employeeId != null) {
      const canDo = await c.env.DB.prepare(
        "SELECT 1 FROM employee_services WHERE employee_id = ? AND service_id = ?"
      )
        .bind(employeeId, serviceId)
        .first();
      if (!canDo) return c.json({ error: "Empleado no realiza este servicio" }, 400);
    }

    let durationMinutes = service.duration_minutes ?? 60;
    if (variantId) {
      try {
        const variant = await c.env.DB.prepare(
          "SELECT duration_minutes FROM service_variants WHERE id = ? AND service_id = ?"
        )
          .bind(variantId, serviceId)
          .first<{ duration_minutes: number | null }>();
        if (variant && variant.duration_minutes != null) {
          durationMinutes = variant.duration_minutes;
        }
      } catch {
        // service_variants table may not exist
      }
    }

    const today = new Date();
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(today.getDate() + 30);

    const availableDates: string[] = [];

    for (let d = new Date(today); d <= thirtyDaysLater; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const dayOfWeek = d.getDay();

      let schedules: { start_time: string; end_time: string }[] | null = null;
      if (employeeId != null) {
        try {
          const r = await c.env.DB.prepare(
            "SELECT start_time, end_time FROM employee_schedules WHERE employee_id = ? AND day_of_week = ? AND is_active = 1"
          )
            .bind(employeeId, dayOfWeek)
            .all<{ start_time: string; end_time: string }>();
          schedules = r.results?.length ? r.results : null;
        } catch {
          schedules = null;
        }
        if (!schedules || schedules.length === 0) continue;
        const timeOff = await c.env.DB.prepare(
          "SELECT 1 FROM employee_time_off WHERE employee_id = ? AND date_from <= ? AND date_to >= ?"
        )
          .bind(employeeId, dateStr, dateStr)
          .first();
        if (timeOff) continue;
      } else {
        try {
          const r = await c.env.DB.prepare(
            "SELECT * FROM availability_schedules WHERE service_id = ? AND day_of_week = ? AND is_active = 1"
          )
            .bind(serviceId, dayOfWeek)
            .all();
          schedules = r.results?.length ? (r.results as { start_time: string; end_time: string }[]) : null;
        } catch {
          schedules = null;
        }
      }

      if (!schedules || schedules.length === 0) {
        continue;
      }

      let exceptions: any[] = [];
      try {
        const exResult = await c.env.DB.prepare(
          `SELECT * FROM schedule_exceptions 
           WHERE tenant_id = ? 
           AND exception_date = ? 
           AND is_blocked = 1
           AND (service_id = ? OR service_id IS NULL)`
        )
          .bind(service.tenant_id, dateStr, serviceId)
          .all();
        exceptions = exResult.results || [];
      } catch {
        // tabla puede no existir
      }

      const isWholeDayBlocked = exceptions?.some((e: any) => !e.start_time && !e.end_time);
      if (isWholeDayBlocked) {
        continue;
      }

      const aptQuery =
        employeeId != null
          ? `SELECT a.appointment_time, COALESCE(sv.duration_minutes, s.duration_minutes) as duration_minutes
             FROM appointments a JOIN services s ON a.service_id = s.id
             LEFT JOIN service_variants sv ON a.service_variant_id = sv.id
             WHERE a.tenant_id = ? AND a.appointment_date = ? AND a.status != 'cancelled'
             AND (a.employee_id IS NULL OR a.employee_id = ?)`
          : `SELECT a.appointment_time, COALESCE(sv.duration_minutes, s.duration_minutes) as duration_minutes
             FROM appointments a JOIN services s ON a.service_id = s.id
             LEFT JOIN service_variants sv ON a.service_variant_id = sv.id
             WHERE a.tenant_id = ? AND a.appointment_date = ? AND a.status != 'cancelled'`;
      let appointments: any[] = [];
      try {
        const aptResult = await c.env.DB.prepare(aptQuery)
          .bind(service.tenant_id, dateStr, ...(employeeId != null ? [employeeId] : []))
          .all();
        appointments = aptResult.results || [];
      } catch {
        // ignorar
      }

      let hasAvailableSlots = false;

      for (const schedule of schedules as any[]) {
        const scheduleStart = timeToMinutes(schedule.start_time);
        const scheduleEnd = timeToMinutes(schedule.end_time);
        const duration = durationMinutes;
        const slotInterval = 15;

        for (let slotStart = scheduleStart; slotStart + duration <= scheduleEnd; slotStart += slotInterval) {
          const slotEnd = slotStart + duration;

          const isBlocked = exceptions?.some((e: any) => {
            if (!e.start_time) return false;
            const exStart = timeToMinutes(e.start_time);
            const exEnd = e.end_time ? timeToMinutes(e.end_time) : exStart + 60;
            return timeRangesOverlap(slotStart, slotEnd, exStart, exEnd);
          });

          if (isBlocked) continue;

          const hasOverlap = appointments?.some((apt: any) => {
            const aptStart = timeToMinutes(apt.appointment_time);
            const aptDuration = apt.duration_minutes || 60;
            const aptEnd = aptStart + aptDuration;
            return timeRangesOverlap(slotStart, slotEnd, aptStart, aptEnd);
          });

          if (!hasOverlap) {
            hasAvailableSlots = true;
            break;
          }
        }

        if (hasAvailableSlots) break;
      }

      if (hasAvailableSlots) {
        availableDates.push(dateStr);
      }
    }

    return c.json(availableDates);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("available-dates error", err);
    return c.json(
      { error: "Error al obtener fechas disponibles", message: msg },
      500
    );
  }
});

// Get available time slots for a service on a specific date
// Optional query: service_variant_id — if set, use variant's duration; employee_id — if set, use employee schedules
app.get("/services/:serviceId/slots", async (c) => {
  if (!c.env.DB) {
    return c.json(
      { error: "Error al obtener horarios", message: "Base de datos no configurada" },
      500
    );
  }
  try {
    const serviceId = parseInt(c.req.param("serviceId"), 10);
    if (isNaN(serviceId)) return c.json({ error: "ID de servicio inválido" }, 400);
    const date = c.req.query("date");
    const variantIdParam = c.req.query("service_variant_id");
    const variantId = variantIdParam ? parseInt(variantIdParam, 10) : null;
    const employeeIdParam = c.req.query("employee_id");
    const employeeId = employeeIdParam ? parseInt(employeeIdParam, 10) : null;

    if (!date) {
      return c.json({ error: "Fecha requerida" }, 400);
    }

    const service = await c.env.DB.prepare(
      "SELECT tenant_id, duration_minutes FROM services WHERE id = ? AND is_active = 1"
    )
      .bind(serviceId)
      .first<{ tenant_id: number; duration_minutes: number | null }>();

    if (!service) {
      return c.json({ error: "Servicio no encontrado" }, 404);
    }

    if (employeeId != null) {
      try {
        const canDo = await c.env.DB.prepare(
          "SELECT 1 FROM employee_services WHERE employee_id = ? AND service_id = ?"
        )
          .bind(employeeId, serviceId)
          .first();
        if (!canDo) return c.json({ error: "Empleado no realiza este servicio" }, 400);
      } catch {
        return c.json({ error: "Empleado no realiza este servicio" }, 400);
      }
    }

    let durationMinutes = service.duration_minutes ?? 60;
    if (variantId) {
      try {
        const variant = await c.env.DB.prepare(
          "SELECT duration_minutes FROM service_variants WHERE id = ? AND service_id = ?"
        )
          .bind(variantId, serviceId)
          .first<{ duration_minutes: number | null }>();
        if (variant && variant.duration_minutes != null) {
          durationMinutes = variant.duration_minutes;
        }
      } catch {
        // service_variants table may not exist
      }
    }

    const dateObj = new Date(date + "T00:00:00");
    const dayOfWeek = dateObj.getDay();

    let schedules: { start_time: string; end_time: string }[] | null = null;
    if (employeeId != null) {
      try {
        const r = await c.env.DB.prepare(
          "SELECT start_time, end_time FROM employee_schedules WHERE employee_id = ? AND day_of_week = ? AND is_active = 1"
        )
          .bind(employeeId, dayOfWeek)
          .all<{ start_time: string; end_time: string }>();
        schedules = r.results?.length ? r.results : null;
      } catch {
        schedules = null;
      }
      if (!schedules || schedules.length === 0) return c.json([]);
      try {
        const timeOff = await c.env.DB.prepare(
          "SELECT 1 FROM employee_time_off WHERE employee_id = ? AND date_from <= ? AND date_to >= ?"
        )
          .bind(employeeId, date, date)
          .first();
        if (timeOff) return c.json([]);
      } catch {
        // employee_time_off may not exist
      }
    } else {
      try {
        const r = await c.env.DB.prepare(
          "SELECT * FROM availability_schedules WHERE service_id = ? AND day_of_week = ? AND is_active = 1"
        )
          .bind(serviceId, dayOfWeek)
          .all();
        schedules = r.results as { start_time: string; end_time: string }[] | null;
      } catch {
        schedules = null;
      }
    }

    if (!schedules || schedules.length === 0) {
      return c.json([]);
    }

    // Get schedule exceptions (blocks) for this date
    let exceptions: any[] = [];
    try {
      const exResult = await c.env.DB.prepare(
        `SELECT * FROM schedule_exceptions 
         WHERE tenant_id = ? 
         AND exception_date = ? 
         AND is_blocked = 1
         AND (service_id = ? OR service_id IS NULL)`
      )
        .bind(service.tenant_id, date, serviceId)
        .all();
      exceptions = exResult.results || [];
    } catch {
      // schedule_exceptions table may not exist
    }

    // Get existing appointments (when employee_id set, only that employee's)
    let appointments: any[] = [];
    const aptQuery =
      employeeId != null
        ? `SELECT a.appointment_time, COALESCE(sv.duration_minutes, s.duration_minutes) as duration_minutes, s.max_simultaneous_bookings
           FROM appointments a JOIN services s ON a.service_id = s.id
           LEFT JOIN service_variants sv ON a.service_variant_id = sv.id
           WHERE a.tenant_id = ? AND a.appointment_date = ? AND a.status != 'cancelled'
           AND (a.employee_id IS NULL OR a.employee_id = ?)`
        : `SELECT a.appointment_time, COALESCE(sv.duration_minutes, s.duration_minutes) as duration_minutes, s.max_simultaneous_bookings
           FROM appointments a JOIN services s ON a.service_id = s.id
           LEFT JOIN service_variants sv ON a.service_variant_id = sv.id
           WHERE a.tenant_id = ? AND a.appointment_date = ? AND a.status != 'cancelled'`;
    try {
      const aptResult = await c.env.DB.prepare(aptQuery)
        .bind(service.tenant_id, date, ...(employeeId != null ? [employeeId] : []))
        .all();
      appointments = aptResult.results || [];
    } catch {
      // appointments or service_variants schema may differ
    }

    const duration = durationMinutes;
    const slotInterval = 15;
    const availableSlots: string[] = [];

    // Check whole day exception first
    const isWholeDayBlocked = exceptions?.some((e: any) => !e.start_time && !e.end_time);
    if (isWholeDayBlocked) {
      return c.json([]);
    }

    for (const schedule of schedules as any[]) {
      const scheduleStart = timeToMinutes(schedule.start_time);
      const scheduleEnd = timeToMinutes(schedule.end_time);

      for (let slotStart = scheduleStart; slotStart + duration <= scheduleEnd; slotStart += slotInterval) {
        const slotEnd = slotStart + duration;
        const slotTimeStr = `${Math.floor(slotStart / 60).toString().padStart(2, "0")}:${(slotStart % 60).toString().padStart(2, "0")}`;

        // Check if slot is blocked by exception
        const isBlocked = exceptions?.some((e: any) => {
          if (!e.start_time) return false;
          const exStart = timeToMinutes(e.start_time);
          const exEnd = e.end_time ? timeToMinutes(e.end_time) : exStart + 60;
          return timeRangesOverlap(slotStart, slotEnd, exStart, exEnd);
        });

        if (isBlocked) continue;

        // Check if slot overlaps with existing appointments (shared resource scheduling)
        let concurrentBookings = 0;
        const hasOverlap = appointments?.some((apt: any) => {
          const aptStart = timeToMinutes(apt.appointment_time);
          const aptDuration = apt.duration_minutes || 60;
          const aptEnd = aptStart + aptDuration;
          const overlaps = timeRangesOverlap(slotStart, slotEnd, aptStart, aptEnd);

          if (overlaps) {
            concurrentBookings++;
          }

          return overlaps;
        });

        // Check if we can book (max_simultaneous_bookings check - for the service being booked)
        let maxBookings = 1;
        try {
          const serviceDetails = await c.env.DB.prepare(
            "SELECT max_simultaneous_bookings FROM services WHERE id = ?"
          )
            .bind(serviceId)
            .first<{ max_simultaneous_bookings: number }>();
          maxBookings = serviceDetails?.max_simultaneous_bookings ?? 1;
        } catch {
          // ignore
        }

        if (hasOverlap && concurrentBookings >= maxBookings) {
          continue; // Slot is full
        }

        availableSlots.push(slotTimeStr);
      }
    }

    return c.json(availableSlots);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("slots error", err);
    return c.json(
      { error: "Error al obtener horarios", message: msg },
      500
    );
  }
});

// Create a new appointment (public endpoint)
app.post("/appointments", async (c) => {
  if (!c.env.DB) {
    return c.json(
      { error: "Error al crear la cita", message: "Base de datos no configurada" },
      500
    );
  }

  // Rate limiting: 10 requests per 60 seconds per IP (fail open if KV missing)
  const clientIP = getClientIP(c.req);
  const rateLimitResult = c.env.SESSIONS_KV
    ? await checkRateLimit(c.env.SESSIONS_KV, clientIP, { limit: 10, window: 60, keyPrefix: "rate_limit:appointments" })
    : { allowed: true as const, reset: 0 };
  if (!rateLimitResult.allowed) {
    return c.json(
      { error: "Demasiadas solicitudes. Por favor, intente más tarde.", reset: rateLimitResult.reset },
      429
    );
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Cuerpo de la solicitud inválido" }, 400);
  }

  if (!body.tenant_id || !body.service_id || !body.appointment_date || !body.appointment_time || !body.customer_name || !body.customer_phone) {
    return c.json({ error: "Campos requeridos faltantes" }, 400);
  }

  const serviceVariantId = body.service_variant_id != null ? parseInt(String(body.service_variant_id), 10) : null;
  const employeeId = body.employee_id != null ? parseInt(String(body.employee_id), 10) : null;

  try {
  // Get service details
  const service = await c.env.DB.prepare(
    "SELECT * FROM services WHERE id = ? AND is_active = 1"
  )
    .bind(body.service_id)
    .first<Service & { duration_minutes: number | null }>();

  if (!service) {
    return c.json({ error: "Servicio no encontrado" }, 404);
  }

  // Verify service belongs to tenant
  if (service.tenant_id !== body.tenant_id) {
    return c.json({ error: "Servicio no pertenece al negocio" }, 400);
  }

  // If employee_id provided, verify employee can do this service
  if (employeeId != null) {
    const empCheck = await c.env.DB.prepare(
      "SELECT 1 FROM employees e INNER JOIN employee_services es ON es.employee_id = e.id WHERE e.id = ? AND e.tenant_id = ? AND es.service_id = ? AND e.is_active = 1"
    )
      .bind(employeeId, body.tenant_id, body.service_id)
      .first();
    if (!empCheck) {
      return c.json({ error: "Empleado no válido para este servicio" }, 400);
    }
  }

  let effectivePrice: number | null = service.price;
  let effectiveDuration = service.duration_minutes ?? 60;
  let variantName: string | null = null;

  if (serviceVariantId) {
    try {
      const variant = await c.env.DB.prepare(
        "SELECT * FROM service_variants WHERE id = ? AND service_id = ?"
      )
        .bind(serviceVariantId, body.service_id)
        .first<{ price: number; duration_minutes: number | null; name: string }>();
      if (!variant) {
        return c.json({ error: "Variante no encontrada" }, 400);
      }
      effectivePrice = variant.price;
      effectiveDuration = variant.duration_minutes ?? service.duration_minutes ?? 60;
      variantName = variant.name;
    } catch {
      return c.json({ error: "Variante no encontrada o no disponible" }, 400);
    }
  }

  const date = body.appointment_date;
  const time = body.appointment_time;
  const duration = effectiveDuration;

  // Check schedule exceptions first (priority)
  let exceptions: any[] = [];
  try {
    const exRes = await c.env.DB.prepare(
      `SELECT * FROM schedule_exceptions 
       WHERE tenant_id = ? 
       AND exception_date = ? 
       AND is_blocked = 1
       AND (service_id = ? OR service_id IS NULL)`
    )
      .bind(body.tenant_id, date, body.service_id)
      .all();
    exceptions = exRes.results || [];
  } catch {
    // schedule_exceptions table may not exist
  }

  const newAppointmentStartMinutes = timeToMinutes(time);
  const newAppointmentDurationMinutes = duration;
  const newAppointmentEndMinutes = newAppointmentStartMinutes + newAppointmentDurationMinutes;

  // Check if whole day is blocked
  const isWholeDayBlocked = exceptions?.some((e: any) => !e.start_time && !e.end_time);
  if (isWholeDayBlocked) {
    return c.json({ error: "Esta fecha está bloqueada" }, 400);
  }

  // Check if specific time slot is blocked
  const isTimeBlocked = exceptions?.some((e: any) => {
    if (!e.start_time) return false;
    const exStart = timeToMinutes(e.start_time);
    const exEnd = e.end_time ? timeToMinutes(e.end_time) : exStart + 60;
    return timeRangesOverlap(newAppointmentStartMinutes, newAppointmentEndMinutes, exStart, exEnd);
  });

  if (isTimeBlocked) {
    return c.json({ error: "Este horario está bloqueado" }, 400);
  }

  // Check for overlaps: when booking with an employee, only count that employee's appointments
  const appointmentsQuery =
    employeeId != null
      ? `SELECT a.appointment_time,
            COALESCE(sv.duration_minutes, s.duration_minutes) as duration_minutes,
            s.max_simultaneous_bookings
         FROM appointments a
         JOIN services s ON a.service_id = s.id
         LEFT JOIN service_variants sv ON a.service_variant_id = sv.id
         WHERE a.tenant_id = ? AND a.appointment_date = ? AND a.status != 'cancelled'
         AND (a.employee_id IS NULL OR a.employee_id = ?)`
      : `SELECT a.appointment_time,
            COALESCE(sv.duration_minutes, s.duration_minutes) as duration_minutes,
            s.max_simultaneous_bookings
         FROM appointments a
         JOIN services s ON a.service_id = s.id
         LEFT JOIN service_variants sv ON a.service_variant_id = sv.id
         WHERE a.tenant_id = ? AND a.appointment_date = ? AND a.status != 'cancelled'`;

  let existingAppointments: any[] = [];
  try {
    const aptRes = await c.env.DB.prepare(appointmentsQuery)
      .bind(body.tenant_id, date, ...(employeeId != null ? [employeeId] : []))
      .all();
    existingAppointments = aptRes.results || [];
  } catch {
    // appointments/schema may differ
  }

  let concurrentBookings = 0;
  const hasOverlap = existingAppointments?.some((apt: any) => {
    const aptStart = timeToMinutes(apt.appointment_time);
    const aptDuration = apt.duration_minutes || 60;
    const aptEnd = aptStart + aptDuration;
    const overlaps = timeRangesOverlap(newAppointmentStartMinutes, newAppointmentEndMinutes, aptStart, aptEnd);
    
    if (overlaps) {
      concurrentBookings++;
    }
    
    return overlaps;
  });

  if (hasOverlap) {
    // Check max_simultaneous_bookings
    const maxBookings = service.max_simultaneous_bookings || 1;
    if (concurrentBookings >= maxBookings) {
      return c.json({ error: "No hay cupos disponibles en este horario" }, 400);
    }
  }

  // Create appointment
  const result = await c.env.DB.prepare(
    `INSERT INTO appointments (
      tenant_id, service_id, service_variant_id, employee_id, customer_name, customer_phone, customer_email,
      appointment_date, appointment_time, status, notes, payment_method,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(
      body.tenant_id,
      body.service_id,
      serviceVariantId,
      employeeId,
      body.customer_name,
      body.customer_phone,
      body.customer_email || null,
      date,
      time,
      body.notes || null,
      body.payment_method || null
    )
    .run();

  const appointment = await c.env.DB.prepare(
    "SELECT * FROM appointments WHERE id = ?"
  )
    .bind(result.meta.last_row_id)
    .first();

  // Get business config for WhatsApp message
  const businessConfig = await c.env.DB.prepare(
    "SELECT business_name, whatsapp FROM business_configs WHERE tenant_id = ?"
  )
    .bind(body.tenant_id)
    .first<{ business_name: string | null; whatsapp: string | null }>();

  // Generate WhatsApp message
  let whatsappUrl: string | null = null;

  if (businessConfig?.whatsapp) {
    const whatsappNumber = businessConfig.whatsapp.replace(/[^0-9]/g, "");
    const dateObj = new Date(date + "T00:00:00");
    const formattedDate = dateObj.toLocaleDateString("es-MX", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Get payment method name
    let paymentMethodText = "";
    if (body.payment_method) {
      const methodMap: { [key: string]: string } = {
        transfer: "Transferencia Bancaria",
        cash: "Efectivo",
        card: "Tarjeta de Crédito/Débito",
      };
      paymentMethodText = methodMap[body.payment_method] || body.payment_method;
    }

    // Construct WhatsApp message (use effective price; service title + variant name if any)
    const serviceTitleForMessage = variantName ? `${service.title} (${variantName})` : service.title;
    let message = `¡Hola ${businessConfig.business_name || "negocio"}! He reservado una cita desde su app. Estos son mis datos de reserva.\n\n`;
    message += `Nombre: ${body.customer_name}\n`;
    message += `Servicio: ${serviceTitleForMessage}\n`;
    if (effectivePrice != null) {
      message += `Costo: $${effectivePrice.toFixed(2)}\n`;
    }
    message += `Fecha: ${formattedDate} a las ${time} (click para guardar)\n`;
    if (paymentMethodText) {
      message += `Metodo de pago: ${paymentMethodText}\n`;
    }
    message += `\nPor favor, podrías confirmar mi cita. Gracias!!`;

    const encodedMessage = encodeURIComponent(message);
    whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
  }

  return c.json({
    ...appointment,
    whatsapp_url: whatsappUrl,
  }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("appointments POST error", err);
    return c.json(
      { error: "Error al crear la cita", message: msg },
      500
    );
  }
});

// Get ICS file for appointment (public endpoint)
app.get("/appointments/:id/ics", async (c) => {
  const appointmentId = parseInt(c.req.param("id"));

  const appointmentDetails = await c.env.DB.prepare(
    `SELECT 
      a.*,
      s.title as service_title,
      COALESCE(sv.duration_minutes, s.duration_minutes) as duration_minutes,
      COALESCE(sv.price, s.price) as service_price,
      sv.name as variant_name,
      bc.business_name,
      bc.address,
      bc.whatsapp
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    LEFT JOIN service_variants sv ON a.service_variant_id = sv.id
    JOIN business_configs bc ON a.tenant_id = bc.tenant_id
    WHERE a.id = ?`
  )
    .bind(appointmentId)
    .first<{
      appointment_date: string;
      appointment_time: string;
      customer_name: string;
      customer_phone: string;
      customer_email: string | null;
      service_title: string;
      duration_minutes: number | null;
      service_price: number | null;
      variant_name: string | null;
      business_name: string | null;
      address: string | null;
      payment_method: string | null;
    }>();

  if (!appointmentDetails) {
    return c.text("Cita no encontrada", 404);
  }

  const [hour, minute] = appointmentDetails.appointment_time.split(":").map(Number);
  const date = new Date(appointmentDetails.appointment_date + "T00:00:00");
  const startDate = new Date(date);
  startDate.setHours(hour, minute, 0, 0);
  
  const duration = appointmentDetails.duration_minutes || 60;
  const endDate = new Date(startDate);
  endDate.setMinutes(endDate.getMinutes() + duration);

  // Get payment method text
  let paymentMethodText = "";
  if (appointmentDetails.payment_method) {
    const methodMap: { [key: string]: string } = {
      transfer: "Transferencia Bancaria",
      cash: "Efectivo",
      card: "Tarjeta",
    };
    paymentMethodText = methodMap[appointmentDetails.payment_method] || appointmentDetails.payment_method;
  }

  const serviceTitleDisplay = appointmentDetails.variant_name
    ? `${appointmentDetails.service_title} (${appointmentDetails.variant_name})`
    : appointmentDetails.service_title;
  const description = `Servicio: ${serviceTitleDisplay}\n`;
  const description2 = `Cliente: ${appointmentDetails.customer_name}\n`;
  const description3 = appointmentDetails.service_price ? `Costo: $${appointmentDetails.service_price.toFixed(2)}\n` : "";
  const description4 = paymentMethodText ? `Método de pago: ${paymentMethodText}\n` : "";
  const description5 = appointmentDetails.customer_phone ? `Teléfono: ${appointmentDetails.customer_phone}\n` : "";
  const description6 = appointmentDetails.customer_email ? `Email: ${appointmentDetails.customer_email}` : "";

  const icsContent = generateICS({
    title: `${serviceTitleDisplay} - ${appointmentDetails.business_name || "Cita"}`,
    description: description + description2 + description3 + description4 + description5 + description6,
    location: appointmentDetails.address || undefined,
    startDate,
    endDate,
    customerName: appointmentDetails.customer_name,
    customerEmail: appointmentDetails.customer_email,
  });

  return c.text(icsContent, 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `attachment; filename="cita-${appointmentId}.ics"`,
  });
});

export default app;

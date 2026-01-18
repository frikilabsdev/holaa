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

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM services WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at DESC"
  )
    .bind(tenant.id)
    .all<Service>();

  return c.json(results);
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
app.get("/services/:serviceId/available-dates", async (c) => {
  const serviceId = parseInt(c.req.param("serviceId"));
  
  const service = await c.env.DB.prepare(
    "SELECT tenant_id, duration_minutes FROM services WHERE id = ? AND is_active = 1"
  )
    .bind(serviceId)
    .first<{ tenant_id: number; duration_minutes: number | null }>();

  if (!service) {
    return c.json({ error: "Servicio no encontrado" }, 404);
  }

  const today = new Date();
  const thirtyDaysLater = new Date(today);
  thirtyDaysLater.setDate(today.getDate() + 30);

  const availableDates: string[] = [];

  // Check each date from today to 30 days ahead
  for (let d = new Date(today); d <= thirtyDaysLater; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday

    // Get schedules for this day of week for this service
    const { results: schedules } = await c.env.DB.prepare(
      "SELECT * FROM availability_schedules WHERE service_id = ? AND day_of_week = ? AND is_active = 1"
    )
      .bind(serviceId, dayOfWeek)
      .all();

    if (!schedules || schedules.length === 0) {
      continue;
    }

    // Check for schedule exceptions (blocks) on this date
    const { results: exceptions } = await c.env.DB.prepare(
      `SELECT * FROM schedule_exceptions 
       WHERE tenant_id = ? 
       AND exception_date = ? 
       AND is_blocked = 1
       AND (service_id = ? OR service_id IS NULL)`
    )
      .bind(service.tenant_id, dateStr, serviceId)
      .all();

    // If whole day is blocked, skip
    const isWholeDayBlocked = exceptions?.some((e: any) => !e.start_time && !e.end_time);
    if (isWholeDayBlocked) {
      continue;
    }

    // Check existing appointments for this tenant on this date
    const { results: appointments } = await c.env.DB.prepare(
      `SELECT a.appointment_time, a.service_id, s.duration_minutes 
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       WHERE a.tenant_id = ? AND a.appointment_date = ? AND a.status != 'cancelled'`
    )
      .bind(service.tenant_id, dateStr)
      .all();

    // Generate time slots and check availability
    let hasAvailableSlots = false;

    for (const schedule of schedules as any[]) {
      const scheduleStart = timeToMinutes(schedule.start_time);
      const scheduleEnd = timeToMinutes(schedule.end_time);
      const duration = service.duration_minutes || 60;
      const slotInterval = 15; // 15 minute intervals

      for (let slotStart = scheduleStart; slotStart + duration <= scheduleEnd; slotStart += slotInterval) {
        const slotEnd = slotStart + duration;

        // Check if slot is blocked by exception
        const isBlocked = exceptions?.some((e: any) => {
          if (!e.start_time) return false; // Already checked whole day
          const exStart = timeToMinutes(e.start_time);
          const exEnd = e.end_time ? timeToMinutes(e.end_time) : exStart + 60;
          return timeRangesOverlap(slotStart, slotEnd, exStart, exEnd);
        });

        if (isBlocked) continue;

        // Check if slot overlaps with existing appointments (shared resource scheduling)
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
});

// Get available time slots for a service on a specific date
app.get("/services/:serviceId/slots", async (c) => {
  const serviceId = parseInt(c.req.param("serviceId"));
  const date = c.req.query("date");

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

  const dateObj = new Date(date + "T00:00:00");
  const dayOfWeek = dateObj.getDay();

  // Get schedules for this day of week
  const { results: schedules } = await c.env.DB.prepare(
    "SELECT * FROM availability_schedules WHERE service_id = ? AND day_of_week = ? AND is_active = 1"
  )
    .bind(serviceId, dayOfWeek)
    .all();

  if (!schedules || schedules.length === 0) {
    return c.json([]);
  }

  // Get schedule exceptions (blocks) for this date
  const { results: exceptions } = await c.env.DB.prepare(
    `SELECT * FROM schedule_exceptions 
     WHERE tenant_id = ? 
     AND exception_date = ? 
     AND is_blocked = 1
     AND (service_id = ? OR service_id IS NULL)`
  )
    .bind(service.tenant_id, date, serviceId)
    .all();

  // Get all existing appointments for this tenant on this date (shared resource scheduling)
  const { results: appointments } = await c.env.DB.prepare(
    `SELECT a.appointment_time, a.service_id, s.duration_minutes, s.max_simultaneous_bookings
     FROM appointments a
     JOIN services s ON a.service_id = s.id
     WHERE a.tenant_id = ? AND a.appointment_date = ? AND a.status != 'cancelled'`
  )
    .bind(service.tenant_id, date)
    .all();

  const duration = service.duration_minutes || 60;
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
      const serviceDetails = await c.env.DB.prepare(
        "SELECT max_simultaneous_bookings FROM services WHERE id = ?"
      )
        .bind(serviceId)
        .first<{ max_simultaneous_bookings: number }>();

      const maxBookings = serviceDetails?.max_simultaneous_bookings || 1;

      if (hasOverlap && concurrentBookings >= maxBookings) {
        continue; // Slot is full
      }

      availableSlots.push(slotTimeStr);
    }
  }

  return c.json(availableSlots);
});

// Create a new appointment (public endpoint)
app.post("/appointments", async (c) => {
  // Rate limiting: 10 requests per 60 seconds per IP
  const clientIP = getClientIP(c.req);
  
  const rateLimitResult = await checkRateLimit(c.env.SESSIONS_KV, clientIP, {
    limit: 10,
    window: 60,
    keyPrefix: "rate_limit:appointments",
  });
  
  if (!rateLimitResult.allowed) {
    return c.json(
      {
        error: "Demasiadas solicitudes. Por favor, intente más tarde.",
        reset: rateLimitResult.reset,
      },
      429
    );
  }

  const body = await c.req.json();

  if (!body.tenant_id || !body.service_id || !body.appointment_date || !body.appointment_time || !body.customer_name || !body.customer_phone) {
    return c.json({ error: "Campos requeridos faltantes" }, 400);
  }

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

  const date = body.appointment_date;
  const time = body.appointment_time;
  const duration = service.duration_minutes || 60;

  // Check schedule exceptions first (priority)
  const { results: exceptions } = await c.env.DB.prepare(
    `SELECT * FROM schedule_exceptions 
     WHERE tenant_id = ? 
     AND exception_date = ? 
     AND is_blocked = 1
     AND (service_id = ? OR service_id IS NULL)`
  )
    .bind(body.tenant_id, date, body.service_id)
    .all();

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

  // Check for overlaps with existing appointments (shared resource scheduling)
  const { results: existingAppointments } = await c.env.DB.prepare(
    `SELECT a.appointment_time, s.duration_minutes, s.max_simultaneous_bookings
     FROM appointments a
     JOIN services s ON a.service_id = s.id
     WHERE a.tenant_id = ? AND a.appointment_date = ? AND a.status != 'cancelled'`
  )
    .bind(body.tenant_id, date)
    .all();

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
      tenant_id, service_id, customer_name, customer_phone, customer_email,
      appointment_date, appointment_time, status, notes, payment_method,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(
      body.tenant_id,
      body.service_id,
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
  let icsUrl: string | null = null;

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

    // Generate ICS file URL for calendar download
    const proto = c.req.header("x-forwarded-proto") || (c.req.url.startsWith("https") ? "https" : "http");
    const host = c.req.header("host") || (c.req.url.match(/\/\/([^\/]+)/)?.[1] || "localhost");
    const baseUrl = `${proto}://${host}`;
    icsUrl = `${baseUrl}/api/public/appointments/${result.meta.last_row_id}/ics`;

    // Construct WhatsApp message
    let message = `¡Hola ${businessConfig.business_name || "negocio"}! He reservado una cita desde su app. Estos son mis datos de reserva.\n\n`;
    message += `Nombre: ${body.customer_name}\n`;
    message += `Servicio: ${service.title}\n`;
    if (service.price) {
      message += `Costo: $${service.price.toFixed(2)}\n`;
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
});

// Get ICS file for appointment (public endpoint)
app.get("/appointments/:id/ics", async (c) => {
  const appointmentId = parseInt(c.req.param("id"));

  const appointmentDetails = await c.env.DB.prepare(
    `SELECT 
      a.*,
      s.title as service_title,
      s.duration_minutes,
      s.price as service_price,
      bc.business_name,
      bc.address,
      bc.whatsapp
    FROM appointments a
    JOIN services s ON a.service_id = s.id
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

  const description = `Servicio: ${appointmentDetails.service_title}\n`;
  const description2 = `Cliente: ${appointmentDetails.customer_name}\n`;
  const description3 = appointmentDetails.service_price ? `Costo: $${appointmentDetails.service_price.toFixed(2)}\n` : "";
  const description4 = paymentMethodText ? `Método de pago: ${paymentMethodText}\n` : "";
  const description5 = appointmentDetails.customer_phone ? `Teléfono: ${appointmentDetails.customer_phone}\n` : "";
  const description6 = appointmentDetails.customer_email ? `Email: ${appointmentDetails.customer_email}` : "";

  const icsContent = generateICS({
    title: `${appointmentDetails.service_title} - ${appointmentDetails.business_name || "Cita"}`,
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

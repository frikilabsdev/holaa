import { Hono } from "hono";
import { authMiddleware } from "@/worker/api/auth";
import type { Appointment } from "@/shared/types";
import { generateICS, generateICSDataURL } from "@/worker/utils/ics";

const app = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

interface AppointmentWithService extends Appointment {
  service_title: string;
}

// Get all appointments for user's tenants
app.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const status = c.req.query("status");
  const tenantId = c.req.query("tenant_id");

  let query = `
    SELECT 
      a.*,
      s.title as service_title
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    JOIN tenants t ON a.tenant_id = t.id
    WHERE t.owner_user_id = ?
  `;
  const params: any[] = [user.id];

  if (status) {
    query += " AND a.status = ?";
    params.push(status);
  }

  if (tenantId) {
    query += " AND a.tenant_id = ?";
    params.push(parseInt(tenantId));
  }

  query += " ORDER BY a.appointment_date DESC, a.appointment_time DESC";

  const { results } = await c.env.DB.prepare(query)
    .bind(...params)
    .all<AppointmentWithService>();

  return c.json(results);
});

// Get a specific appointment
app.get("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const appointmentId = parseInt(c.req.param("id"));

  const appointment = await c.env.DB.prepare(
    `SELECT 
      a.*,
      s.title as service_title
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    JOIN tenants t ON a.tenant_id = t.id
    WHERE a.id = ? AND t.owner_user_id = ?`
  )
    .bind(appointmentId, user.id)
    .first<AppointmentWithService>();

  if (!appointment) {
    return c.json({ error: "Cita no encontrada" }, 404);
  }

  return c.json(appointment);
});

// Download ICS file for an appointment
app.get("/:id/ics", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const appointmentId = parseInt(c.req.param("id"));

  const appointmentDetails = await c.env.DB.prepare(
    `SELECT 
      a.*,
      s.title as service_title,
      s.duration_minutes,
      bc.business_name,
      bc.address
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    JOIN tenants t ON a.tenant_id = t.id
    JOIN business_configs bc ON a.tenant_id = bc.tenant_id
    WHERE a.id = ? AND t.owner_user_id = ?`
  )
    .bind(appointmentId, user.id)
    .first<Appointment & { 
      service_title: string;
      duration_minutes: number | null;
      business_name: string | null;
      address: string | null;
    }>();

  if (!appointmentDetails) {
    return c.json({ error: "Cita no encontrada" }, 404);
  }

  const [hour, minute] = appointmentDetails.appointment_time.split(":").map(Number);
  const startDate = new Date(appointmentDetails.appointment_date + "T00:00:00");
  startDate.setHours(hour, minute, 0, 0);
  
  const durationMinutes = appointmentDetails.duration_minutes || 60;
  const endDate = new Date(startDate);
  endDate.setMinutes(endDate.getMinutes() + durationMinutes);

  // Get payment method name
  let paymentMethodText = "";
  if (appointmentDetails.payment_method) {
    const methodMap: { [key: string]: string } = {
      transfer: "Transferencia Bancaria",
      cash: "Efectivo",
      card: "Tarjeta",
    };
    paymentMethodText = methodMap[appointmentDetails.payment_method] || appointmentDetails.payment_method;
  }

  const icsContent = generateICS({
    title: `${appointmentDetails.service_title} - ${appointmentDetails.business_name || 'Cita'}`,
    description: `Cita confirmada para ${appointmentDetails.service_title}${paymentMethodText ? `\nMétodo de pago: ${paymentMethodText}` : ''}`,
    location: appointmentDetails.address || undefined,
    startDate,
    endDate,
    customerName: appointmentDetails.customer_name,
    customerEmail: appointmentDetails.customer_email,
  });

  const fileName = `cita-${appointmentDetails.id}-${appointmentDetails.appointment_date.replace(/-/g, '')}.ics`;

  return c.text(icsContent, 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `attachment; filename="${fileName}"`,
  });
});

// Update appointment status
app.patch("/:id/status", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const appointmentId = parseInt(c.req.param("id"));
  const body = await c.req.json();

  if (!body.status) {
    return c.json({ error: "El campo 'status' es requerido" }, 400);
  }

  const validStatuses = ["pending", "confirmed", "cancelled", "completed"];
  if (!validStatuses.includes(body.status)) {
    return c.json({ error: "Estado inválido" }, 400);
  }

  // Verify ownership and get current status
  const appointment = await c.env.DB.prepare(
    `SELECT a.id, a.status FROM appointments a
     JOIN tenants t ON a.tenant_id = t.id
     WHERE a.id = ? AND t.owner_user_id = ?`
  )
    .bind(appointmentId, user.id)
    .first<{ id: number; status: string }>();

  if (!appointment) {
    return c.json({ error: "Cita no encontrada" }, 404);
  }

  // Block any status changes if appointment is already completed
  if (appointment.status === "completed") {
    return c.json({ error: "No se puede cambiar el estado de una cita completada" }, 403);
  }

  // Get full appointment details with business config for WhatsApp
  const appointmentDetails = await c.env.DB.prepare(
    `SELECT 
      a.*,
      s.title as service_title,
      s.duration_minutes,
      s.price as service_price,
      bc.whatsapp as business_whatsapp,
      bc.business_name,
      bc.address
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    JOIN business_configs bc ON a.tenant_id = bc.tenant_id
    WHERE a.id = ?`
  )
    .bind(appointmentId)
    .first<AppointmentWithService & { 
      business_whatsapp: string | null;
      duration_minutes: number | null;
      service_price: number | null;
      business_name: string | null;
      address: string | null;
    }>();

  if (!appointmentDetails) {
    return c.json({ error: "Cita no encontrada" }, 404);
  }

  // If uncancelling (changing from cancelled to pending), require notes/reason
  if (appointment.status === "cancelled" && body.status === "pending") {
    if (!body.notes || !body.notes.trim()) {
      return c.json({ error: "El motivo de descancelación es requerido" }, 400);
    }
  }

  // Update status and notes if provided (for uncancelling, notes are required)
  const updateQuery = body.notes !== undefined
    ? `UPDATE appointments SET status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`
    : `UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ?`;
  
  const bindValues = body.notes !== undefined
    ? [body.status, body.notes, appointmentId]
    : [body.status, appointmentId];

  await c.env.DB.prepare(updateQuery)
    .bind(...bindValues)
    .run();

  const updated = await c.env.DB.prepare(
    `SELECT 
      a.*,
      s.title as service_title
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    WHERE a.id = ?`
  )
    .bind(appointmentId)
    .first<AppointmentWithService>();

  // Generate WhatsApp URL if status is confirmed or cancelled and business has WhatsApp
  let whatsappUrl: string | null = null;
  let icsDataUrl: string | null = null;
  
  if (
    (body.status === "confirmed" || body.status === "cancelled") &&
    appointmentDetails.business_whatsapp
  ) {
    const whatsappNumber = appointmentDetails.business_whatsapp.replace(
      /[^0-9]/g,
      ""
    );
    const date = new Date(appointmentDetails.appointment_date + "T00:00:00");
    const formattedDate = date.toLocaleDateString("es-MX", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Get payment method name
    let paymentMethodText = "";
    if (appointmentDetails.payment_method) {
      const methodMap: { [key: string]: string } = {
        transfer: "Transferencia Bancaria",
        cash: "Efectivo",
        card: "Tarjeta",
      };
      paymentMethodText = methodMap[appointmentDetails.payment_method] || appointmentDetails.payment_method;
    }

    let message = "";
    if (body.status === "confirmed") {
      message = `¡Hola ${appointmentDetails.customer_name}! Tu cita ha sido confirmada.\n\n`;
      message += `Servicio: ${appointmentDetails.service_title}\n`;
      
      if (appointmentDetails.service_price) {
        message += `Costo: $${appointmentDetails.service_price.toFixed(2)}\n`;
      }
      
      message += `Fecha: ${formattedDate}\n`;
      message += `Hora: ${appointmentDetails.appointment_time}\n`;
      
      if (paymentMethodText) {
        message += `Metodo de pago: ${paymentMethodText}\n`;
      }
      
      message += `\nTe esperamos en ${appointmentDetails.business_name || "nuestro negocio"}.`;
    } else if (body.status === "cancelled") {
      message = `Hola ${appointmentDetails.customer_name}. Lamentamos informarte que tu cita del ${formattedDate} a las ${appointmentDetails.appointment_time} ha sido cancelada. Por favor contáctanos si necesitas reagendar.`;
    }

    // Generate ICS file for confirmed appointments
    if (body.status === "confirmed") {
      const [hour, minute] = appointmentDetails.appointment_time.split(":").map(Number);
      const startDate = new Date(date);
      startDate.setHours(hour, minute, 0, 0);
      
      const durationMinutes = appointmentDetails.duration_minutes || 60;
      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + durationMinutes);

      const icsContent = generateICS({
        title: `${appointmentDetails.service_title} - ${appointmentDetails.business_name || 'Cita'}`,
        description: `Cita confirmada para ${appointmentDetails.service_title}${paymentMethodText ? `\nMétodo de pago: ${paymentMethodText}` : ''}`,
        location: appointmentDetails.address || undefined,
        startDate,
        endDate,
        customerName: appointmentDetails.customer_name,
        customerEmail: appointmentDetails.customer_email,
      });

      icsDataUrl = generateICSDataURL(icsContent);
    }

    const encodedMessage = encodeURIComponent(message);
    whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
  }

  return c.json({ ...updated, whatsapp_url: whatsappUrl, ics_data_url: icsDataUrl });
});

// Update appointment details
app.put("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const appointmentId = parseInt(c.req.param("id"));
  const body = await c.req.json();

  // Verify ownership
  const appointment = await c.env.DB.prepare(
    `SELECT a.* FROM appointments a
     JOIN tenants t ON a.tenant_id = t.id
     WHERE a.id = ? AND t.owner_user_id = ?`
  )
    .bind(appointmentId, user.id)
    .first<Appointment>();

  if (!appointment) {
    return c.json({ error: "Cita no encontrada" }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.appointment_date) {
    updates.push("appointment_date = ?");
    values.push(body.appointment_date);
  }

  if (body.appointment_time) {
    updates.push("appointment_time = ?");
    values.push(body.appointment_time);
  }

  if (body.customer_name) {
    updates.push("customer_name = ?");
    values.push(body.customer_name);
  }

  if (body.customer_phone) {
    updates.push("customer_phone = ?");
    values.push(body.customer_phone);
  }

  if (body.customer_email !== undefined) {
    updates.push("customer_email = ?");
    values.push(body.customer_email);
  }

  if (body.notes !== undefined) {
    updates.push("notes = ?");
    values.push(body.notes);
  }

  if (body.status) {
    // Block status changes if appointment is already completed
    if (appointment.status === "completed") {
      return c.json({ error: "No se puede cambiar el estado de una cita completada" }, 403);
    }

    const validStatuses = ["pending", "confirmed", "cancelled", "completed"];
    if (!validStatuses.includes(body.status)) {
      return c.json({ error: "Estado inválido" }, 400);
    }
    updates.push("status = ?");
    values.push(body.status);
  }

  if (updates.length === 0) {
    return c.json(appointment);
  }

  updates.push("updated_at = datetime('now')");
  values.push(appointmentId);

  await c.env.DB.prepare(
    `UPDATE appointments SET ${updates.join(", ")} WHERE id = ?`
  )
    .bind(...values)
    .run();

  const updated = await c.env.DB.prepare(
    `SELECT 
      a.*,
      s.title as service_title
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    WHERE a.id = ?`
  )
    .bind(appointmentId)
    .first<AppointmentWithService>();

  return c.json(updated);
});

// Delete appointment
app.delete("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const appointmentId = parseInt(c.req.param("id"));

  // Verify ownership
  const appointment = await c.env.DB.prepare(
    `SELECT a.id FROM appointments a
     JOIN tenants t ON a.tenant_id = t.id
     WHERE a.id = ? AND t.owner_user_id = ?`
  )
    .bind(appointmentId, user.id)
    .first();

  if (!appointment) {
    return c.json({ error: "Cita no encontrada" }, 404);
  }

  await c.env.DB.prepare("DELETE FROM appointments WHERE id = ?")
    .bind(appointmentId)
    .run();

  return c.json({ success: true });
});

export default app;

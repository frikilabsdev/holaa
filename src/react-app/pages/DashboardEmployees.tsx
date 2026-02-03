import { useState, useEffect } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  User,
  Phone,
  Clock,
  CalendarOff,
  Briefcase,
  X,
  Loader2,
} from "lucide-react";
import type { Employee, EmployeeSchedule, EmployeeTimeOff, Service, Tenant } from "@/shared/types";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface EmployeeWithServices extends Employee {
  service_ids?: number[];
}

export default function DashboardEmployeesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<number | null>(null);
  const [employees, setEmployees] = useState<EmployeeWithServices[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailEmployeeId, setDetailEmployeeId] = useState<number | null>(null);
  const [detailEmployee, setDetailEmployee] = useState<(Employee & { service_ids: number[]; schedules: EmployeeSchedule[]; time_off: EmployeeTimeOff[] }) | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", email: "", is_active: true });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ day_of_week: 1, start_time: "09:00", end_time: "18:00" });
  const [timeOffForm, setTimeOffForm] = useState({ date_from: "", date_to: "", reason: "" });
  const [isAddingSchedule, setIsAddingSchedule] = useState(false);
  const [isAddingTimeOff, setIsAddingTimeOff] = useState(false);

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      fetchEmployees();
      fetchServices();
    }
  }, [selectedTenant]);

  useEffect(() => {
    if (detailEmployeeId) {
      fetchEmployeeDetail(detailEmployeeId);
    } else {
      setDetailEmployee(null);
    }
  }, [detailEmployeeId]);

  const fetchTenants = async () => {
    try {
      const res = await fetch("/api/tenants", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTenants(data);
        if (data.length > 0) setSelectedTenant(data[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmployees = async () => {
    if (!selectedTenant) return;
    try {
      const res = await fetch(`/api/employees?tenant_id=${selectedTenant}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchServices = async () => {
    if (!selectedTenant) return;
    try {
      const res = await fetch(`/api/services?tenant_id=${selectedTenant}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setServices(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEmployeeDetail = async (id: number) => {
    try {
      const res = await fetch(`/api/employees/${id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDetailEmployee(data);
      } else {
        setDetailEmployeeId(null);
      }
    } catch (e) {
      console.error(e);
      setDetailEmployeeId(null);
    }
  };

  const openCreate = () => {
    setFormData({ name: "", phone: "", email: "", is_active: true });
    setDetailEmployeeId(null);
    setIsModalOpen(true);
  };

  const openEdit = (emp: EmployeeWithServices) => {
    setFormData({
      name: emp.name,
      phone: emp.phone ?? "",
      email: emp.email ?? "",
      is_active: emp.is_active,
    });
    setDetailEmployeeId(emp.id);
    setIsModalOpen(false);
    fetchEmployeeDetail(emp.id);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tenant_id: selectedTenant,
          name: formData.name,
          phone: formData.phone || null,
          email: formData.email || null,
          is_active: formData.is_active,
        }),
      });
      if (res.ok) {
        await fetchEmployees();
        setIsModalOpen(false);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Error al crear empleado");
      }
    } catch (e) {
      console.error(e);
      alert("Error al crear empleado");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailEmployeeId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/employees/${detailEmployeeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone || null,
          email: formData.email || null,
          is_active: formData.is_active,
        }),
      });
      if (res.ok) {
        await fetchEmployees();
        if (detailEmployee) setDetailEmployee({ ...detailEmployee, ...formData });
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Error al actualizar");
      }
    } catch (e) {
      console.error(e);
      alert("Error al actualizar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailEmployeeId) return;
    setIsAddingSchedule(true);
    try {
      const res = await fetch(`/api/employees/${detailEmployeeId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          day_of_week: scheduleForm.day_of_week,
          start_time: scheduleForm.start_time,
          end_time: scheduleForm.end_time,
          is_active: true,
        }),
      });
      if (res.ok) {
        await fetchEmployeeDetail(detailEmployeeId);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Error al agregar horario");
      }
    } catch (e) {
      console.error(e);
      alert("Error al agregar horario");
    } finally {
      setIsAddingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    if (!detailEmployeeId || !confirm("¿Eliminar este horario?")) return;
    try {
      const res = await fetch(`/api/employees/${detailEmployeeId}/schedules/${scheduleId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) await fetchEmployeeDetail(detailEmployeeId);
    } catch (e) {
      console.error(e);
      alert("Error al eliminar");
    }
  };

  const handleAddTimeOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailEmployeeId || !timeOffForm.date_from || !timeOffForm.date_to) return;
    if (timeOffForm.date_from > timeOffForm.date_to) {
      alert("La fecha de inicio no puede ser mayor que la de fin.");
      return;
    }
    setIsAddingTimeOff(true);
    try {
      const res = await fetch(`/api/employees/${detailEmployeeId}/time-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date_from: timeOffForm.date_from,
          date_to: timeOffForm.date_to,
          reason: timeOffForm.reason || null,
        }),
      });
      if (res.ok) {
        setTimeOffForm({ date_from: "", date_to: "", reason: "" });
        await fetchEmployeeDetail(detailEmployeeId);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Error al agregar ausencia");
      }
    } catch (e) {
      console.error(e);
      alert("Error al agregar ausencia");
    } finally {
      setIsAddingTimeOff(false);
    }
  };

  const handleDeleteTimeOff = async (timeOffId: number) => {
    if (!detailEmployeeId || !confirm("¿Eliminar esta ausencia?")) return;
    try {
      const res = await fetch(`/api/employees/${detailEmployeeId}/time-off/${timeOffId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) await fetchEmployeeDetail(detailEmployeeId);
    } catch (e) {
      console.error(e);
      alert("Error al eliminar");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este empleado? Se perderán sus horarios y ausencias.")) return;
    try {
      const res = await fetch(`/api/employees/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        if (detailEmployeeId === id) setDetailEmployeeId(null);
        await fetchEmployees();
      } else {
        alert("Error al eliminar");
      }
    } catch (e) {
      console.error(e);
      alert("Error al eliminar");
    }
  };

  const handleSaveServices = async (serviceIds: number[]) => {
    if (!detailEmployeeId) return;
    try {
      const res = await fetch(`/api/employees/${detailEmployeeId}/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ service_ids: serviceIds }),
      });
      if (res.ok && detailEmployee) {
        setDetailEmployee({ ...detailEmployee, service_ids: serviceIds });
      }
    } catch (e) {
      console.error(e);
      alert("Error al guardar servicios");
    }
  };

  const toggleService = (serviceId: number) => {
    if (!detailEmployee) return;
    const current = detailEmployee.service_ids || [];
    const next = current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId];
    handleSaveServices(next);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200/60 p-12 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">No tienes negocios</h2>
          <p className="text-slate-600">Crea un negocio en Configuración para poder agregar empleados.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Empleados</h2>
          <p className="text-slate-600 mt-1">Gestiona quién realiza cada servicio y sus horarios.</p>
        </div>
        <div className="flex items-center gap-3">
          {tenants.length > 1 && (
            <select
              value={selectedTenant ?? ""}
              onChange={(e) => setSelectedTenant(parseInt(e.target.value))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>/{t.slug}</option>
              ))}
            </select>
          )}
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all"
          >
            <Plus className="w-5 h-5" />
            Nuevo empleado
          </button>
        </div>
      </div>

      {/* Modal crear empleado */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Nuevo empleado</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  placeholder="Ej: María García"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  placeholder="Ej: 5512345678"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Correo</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  placeholder="empleado@ejemplo.com"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                />
                <span className="text-sm text-slate-700">Activo</span>
              </label>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Creando..." : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de empleados */}
        <div className="lg:col-span-1 space-y-3">
          {employees.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-8 text-center text-slate-600">
              No hay empleados. Crea uno para asignar servicios y horarios.
            </div>
          ) : (
            employees.map((emp) => (
              <div
                key={emp.id}
                className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${
                  detailEmployeeId === emp.id
                    ? "border-blue-500 ring-2 ring-blue-500/20"
                    : "border-slate-200/60 hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(emp)}
                    className="text-left flex-1 min-w-0"
                  >
                    <p className="font-semibold text-slate-900 truncate">{emp.name}</p>
                    {emp.phone && (
                      <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3.5 h-3.5" />
                        {emp.phone}
                      </p>
                    )}
                    <span
                      className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                        emp.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {emp.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(emp)}
                      className="p-2 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(emp.id)}
                      className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Panel detalle: editar datos, servicios, horarios, ausencias */}
        <div className="lg:col-span-2">
          {detailEmployee ? (
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-slate-900">{detailEmployee.name}</h3>
                  <button
                    type="button"
                    onClick={() => setDetailEmployeeId(null)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleUpdate} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Teléfono</label>
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Correo</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                    />
                    <span className="text-sm text-slate-700">Activo</span>
                  </label>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSubmitting ? "Guardando..." : "Guardar datos"}
                  </button>
                </form>
              </div>

              <div className="p-6 border-t border-slate-200">
                <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Servicios que puede realizar
                </h4>
                <p className="text-sm text-slate-500 mb-3">Marca los servicios que ofrece este empleado.</p>
                <div className="flex flex-wrap gap-2">
                  {services.map((s) => (
                    <label
                      key={s.id}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        (detailEmployee.service_ids || []).includes(s.id)
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={(detailEmployee.service_ids || []).includes(s.id)}
                        onChange={() => toggleService(s.id)}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">{s.title}</span>
                    </label>
                  ))}
                  {services.length === 0 && (
                    <p className="text-sm text-slate-500">No hay servicios en este negocio. Crea servicios primero.</p>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-slate-200">
                <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Horarios de trabajo
                </h4>
                <p className="text-sm text-slate-500 mb-3">
                  Se usan en la reserva cuando el cliente elige a este empleado. Si no hay horarios, se usan los del servicio.
                </p>
                {detailEmployee.schedules && detailEmployee.schedules.length > 0 && (
                  <ul className="space-y-2 mb-4">
                    {detailEmployee.schedules.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700"
                      >
                        <span>{DAYS[s.day_of_week]} {s.start_time} – {s.end_time}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSchedule(s.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Eliminar horario"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {(!detailEmployee.schedules || detailEmployee.schedules.length === 0) && (
                  <p className="text-sm text-slate-500 mb-3">Sin horarios. Agrega al menos uno para que la reserva use los de este empleado.</p>
                )}
                <form onSubmit={handleAddSchedule} className="flex flex-wrap gap-2 items-end">
                  <select
                    value={scheduleForm.day_of_week}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: parseInt(e.target.value) })}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  >
                    {DAYS.map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={scheduleForm.start_time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                  <span className="text-slate-500 text-sm">–</span>
                  <input
                    type="time"
                    value={scheduleForm.end_time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isAddingSchedule}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isAddingSchedule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Añadir horario
                  </button>
                </form>
              </div>

              <div className="p-6 border-t border-slate-200">
                <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <CalendarOff className="w-4 h-4" />
                  Ausencias (vacaciones, etc.)
                </h4>
                <p className="text-sm text-slate-500 mb-3">
                  Fechas en las que este empleado no atiende. No se mostrarán slots en la reserva.
                </p>
                {detailEmployee.time_off && detailEmployee.time_off.length > 0 && (
                  <ul className="space-y-2 mb-4">
                    {detailEmployee.time_off.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700"
                      >
                        <span>
                          {t.date_from} – {t.date_to}
                          {t.reason ? ` (${t.reason})` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteTimeOff(t.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Eliminar ausencia"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {(!detailEmployee.time_off || detailEmployee.time_off.length === 0) && (
                  <p className="text-sm text-slate-500 mb-3">Sin ausencias registradas.</p>
                )}
                <form onSubmit={handleAddTimeOff} className="flex flex-wrap gap-2 items-end">
                  <input
                    type="date"
                    required
                    value={timeOffForm.date_from}
                    onChange={(e) => setTimeOffForm({ ...timeOffForm, date_from: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    placeholder="Desde"
                  />
                  <input
                    type="date"
                    required
                    value={timeOffForm.date_to}
                    onChange={(e) => setTimeOffForm({ ...timeOffForm, date_to: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    placeholder="Hasta"
                  />
                  <input
                    type="text"
                    value={timeOffForm.reason}
                    onChange={(e) => setTimeOffForm({ ...timeOffForm, reason: e.target.value })}
                    className="min-w-[120px] px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    placeholder="Motivo (opcional)"
                  />
                  <button
                    type="submit"
                    disabled={isAddingTimeOff}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isAddingTimeOff ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Añadir ausencia
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-12 text-center text-slate-500">
              <User className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p>Selecciona un empleado para editar sus datos, servicios y horarios.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

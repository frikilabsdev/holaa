import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/react-app/contexts/AuthContext";
import {
  Calendar,
  User,
  Phone,
  Mail,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  CreditCard,
  Bell
} from "lucide-react";

interface Appointment {
  id: number;
  tenant_id: number;
  service_id: number;
  service_title: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  appointment_date: string;
  appointment_time: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
  whatsapp_url?: string | null;
}

// Simple Toast Notification Component
const ToastNotification = ({ message, onClose }: { message: string; onClose: () => void }) => (
  <div className="fixed top-4 right-4 z-50 animate-fade-in-down">
    <div className="bg-white rounded-2xl shadow-2xl border border-blue-100 p-4 flex items-start gap-4 max-w-sm ring-1 ring-black/5">
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-full shadow-lg shadow-blue-500/30">
        <Bell className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-slate-900 text-sm">Nueva Cita Pendiente</h4>
        <p className="text-slate-600 text-sm mt-1 leading-snug">{message}</p>
      </div>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-600 transition-colors bg-transparent p-1 -mr-2 -mt-2 rounded-full hover:bg-slate-50"
      >
        <XCircle className="w-5 h-5" />
      </button>
    </div>
  </div>
);

export default function DashboardAppointmentsPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Uncancel Modal State
  const [showUncancelModal, setShowUncancelModal] = useState(false);
  const [uncancelAppointmentId, setUncancelAppointmentId] = useState<number | null>(null);
  const [uncancelReason, setUncancelReason] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Notification System
  const [notification, setNotification] = useState<string | null>(null);
  const knownPendingIdsRef = useRef<Set<number>>(new Set());
  const isFirstLoadRef = useRef(true);

  // Sound effect ref (optional, but good for UX)
  const notificationSound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize sound
    notificationSound.current = new Audio('/notification.mp3'); // Assuming a sound file exists or fails silently

    if (user) {
      fetchAppointments();
      // Polling every 15 seconds for snappier notifications
      const interval = setInterval(fetchAppointments, 15000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    filterAppointments();
    setCurrentPage(1);
  }, [statusFilter, appointments]);

  const filterAppointments = () => {
    if (statusFilter === "all") {
      setFilteredAppointments(appointments);
    } else {
      setFilteredAppointments(appointments.filter((apt) => apt.status === statusFilter));
    }
  };

  const fetchAppointments = async () => {
    // Don't clear errors on background polling to avoid flickering states
    if (isFirstLoadRef.current) setLoadError(null);

    try {
      const response = await fetch("/api/appointments");
      if (response.ok) {
        const data: Appointment[] = await response.json();
        const validData = Array.isArray(data) ? data : [];

        // Handle Notifications Logic
        const currentPending = validData.filter(a => a.status === 'pending');
        const newPendingIds = new Set(currentPending.map(a => a.id));

        // Check for NEW pending appointments (only after first load)
        if (!isFirstLoadRef.current) {
          const brandNew = currentPending.filter(a => !knownPendingIdsRef.current.has(a.id));
          if (brandNew.length > 0) {
            const latest = brandNew[0]; // Show info about the most recent one
            const count = brandNew.length;
            setNotification(
              count > 1
                ? `Tienes ${count} nuevas citas pendientes.`
                : `Cliente: ${latest.customer_name} - ${latest.service_title}`
            );

            // Play sound
            try { notificationSound.current?.play().catch(() => { }); } catch { }
          }
        } else {
          // On first load, just populate known IDs without notifying
          knownPendingIdsRef.current = newPendingIds;
        }

        // Update known IDs for next poll
        // We update this every time to handle removed (confirmed/cancelled) items correctly
        knownPendingIdsRef.current = newPendingIds;

        setAppointments(validData);
        isFirstLoadRef.current = false;
      } else {
        if (isFirstLoadRef.current) {
          const body = await response.json().catch(() => ({}));
          setLoadError(body?.message || `Error ${response.status}`);
          setAppointments([]);
        }
      }
    } catch (err) {
      console.error("Error al cargar citas:", err);
      if (isFirstLoadRef.current) {
        setLoadError("No se pudieron cargar las citas.");
        setAppointments([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (id: number, status: string, reason?: string) => {
    try {
      const response = await fetch(`/api/appointments/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: reason || null }),
      });

      if (response.ok) {
        const updated = await response.json();
        setAppointments((prev) =>
          prev.map((apt) => (apt.id === id ? updated : apt))
        );

        if (updated.whatsapp_url && (status === "confirmed" || status === "cancelled")) {
          window.open(updated.whatsapp_url, "_blank");
        }

        if (status === "pending" && showUncancelModal) {
          setShowUncancelModal(false);
          setUncancelAppointmentId(null);
          setUncancelReason("");
        }
      } else {
        alert("Error al actualizar estado");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error al actualizar estado");
    }
  };

  const handleUncancel = () => {
    if (!uncancelAppointmentId || !uncancelReason.trim()) {
      alert("Por favor, ingresa un motivo");
      return;
    }
    updateStatus(uncancelAppointmentId, "pending", uncancelReason);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "pending":
        return { color: "bg-amber-100 text-amber-800 border-amber-200", icon: <AlertCircle className="w-4 h-4" />, label: "Pendiente" };
      case "confirmed":
        return { color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: <CheckCircle className="w-4 h-4" />, label: "Confirmada" };
      case "completed":
        return { color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: <CheckCircle className="w-4 h-4" />, label: "Completada" };
      case "cancelled":
        return { color: "bg-rose-100 text-rose-800 border-rose-200", icon: <XCircle className="w-4 h-4" />, label: "Cancelada" };
      default:
        return { color: "bg-slate-100 text-slate-800 border-slate-200", icon: null, label: status };
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  };

  // Grouping & Sorting
  const groupedAppointments = filteredAppointments.reduce((acc, apt) => {
    (acc[apt.appointment_date] = acc[apt.appointment_date] || []).push(apt);
    return acc;
  }, {} as { [key: string]: Appointment[] });

  const sortedDates = Object.keys(groupedAppointments).sort((a, b) => b.localeCompare(a));

  // Pagination Logic
  const flatList = sortedDates.flatMap(date =>
    groupedAppointments[date].sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))
  );

  const totalPages = Math.ceil(flatList.length / itemsPerPage);
  const paginatedList = flatList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Regroup paginated items for display
  const displayGroups = paginatedList.reduce((acc, apt) => {
    (acc[apt.appointment_date] = acc[apt.appointment_date] || []).push(apt);
    return acc;
  }, {} as { [key: string]: Appointment[] });
  const displayDates = Object.keys(displayGroups).sort((a, b) => b.localeCompare(a));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-10 h-10 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      {notification && <ToastNotification message={notification} onClose={() => setNotification(null)} />}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Citas</h1>
          <p className="text-slate-500 mt-1">Gestiona y monitorea las reservas de tu negocio</p>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 md:p-6 flex flex-col md:flex-row items-center gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <p className="text-red-800 text-sm flex-1">{loadError}</p>
          <button onClick={() => { isFirstLoadRef.current = true; setIsLoading(true); fetchAppointments(); }} className="px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition">
            Reintentar
          </button>
        </div>
      )}

      {/* Stats Cards - Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {[
          { label: 'Total', count: appointments.length, icon: Calendar, color: 'bg-indigo-500' },
          { label: 'Pendientes', count: appointments.filter(a => a.status === 'pending').length, icon: AlertCircle, color: 'bg-amber-500' },
          { label: 'Confirmadas', count: appointments.filter(a => a.status === 'confirmed').length, icon: CheckCircle, color: 'bg-emerald-500' },
          { label: 'Canceladas', count: appointments.filter(a => a.status === 'cancelled').length, icon: XCircle, color: 'bg-slate-400' }
        ].map((stat, idx) => (
          <div key={idx} className="bg-white p-5 md:p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(6,81,237,0.1)] hover:shadow-lg transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-xl ${stat.color} bg-opacity-10`}>
                <stat.icon className={`w-6 h-6 ${stat.color.replace('bg-', 'text-')}`} />
              </div>
              <span className="text-3xl font-bold text-slate-900">{stat.count}</span>
            </div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Controls Bar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 md:p-5 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Filter className="w-5 h-5 text-slate-400" />
          <div className="relative w-full md:w-64">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full appearance-none pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer hover:border-slate-300 transition-colors"
            >
              <option value="all">Todas las citas</option>
              <option value="pending">Pendientes</option>
              <option value="confirmed">Confirmadas</option>
              <option value="completed">Completadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <span className="text-sm text-slate-500 hidden sm:inline">Resultados por página:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => { setItemsPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
          >
            {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Appointments List */}
      {paginatedList.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-16 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Calendar className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">No se encontraron citas</h3>
          <p className="text-slate-500">Intenta cambiar los filtros o espera nuevas reservas.</p>
          {statusFilter !== 'all' && (
            <button onClick={() => setStatusFilter('all')} className="mt-6 text-indigo-600 font-semibold hover:underline">
              Ver todas las citas
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {displayDates.map(date => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-1.5 h-6 bg-slate-200 rounded-full"></span>
                <h3 className="text-base font-bold text-slate-600 uppercase tracking-widest">{formatDate(date)}</h3>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {displayGroups[date].map(apt => {
                  const statusConfig = getStatusConfig(apt.status);
                  const isExpanded = expandedId === apt.id;

                  return (
                    <div
                      key={apt.id}
                      className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden ${isExpanded
                        ? 'border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500/20'
                        : 'border-slate-100 shadow-sm hover:border-indigo-200 hover:shadow-md'
                        }`}
                    >
                      {/* Card Header */}
                      <div className="p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : apt.id)}>
                        {/* Time & Status */}
                        <div className="flex items-center gap-4 min-w-[120px]">
                          <div className="bg-slate-50 px-3 py-2 md:py-3 rounded-xl text-center border border-slate-100 min-w-[80px]">
                            <span className="block text-lg font-black text-slate-900">{apt.appointment_time}</span>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-900 text-lg mb-1 truncate">{apt.service_title}</h4>
                          <div className="flex items-center gap-2 text-slate-500 text-sm">
                            <User className="w-4 h-4 flex-shrink-0" />
                            <span className="font-medium truncate">{apt.customer_name}</span>
                          </div>
                        </div>

                        {/* Status Badge (Desktop right, Mobile below) */}
                        <div className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide flex items-center gap-2 border self-start md:self-center ${statusConfig.color}`}>
                          {statusConfig.icon}
                          {statusConfig.label}
                        </div>

                        <div className="hidden md:block">
                          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="px-5 pb-6 pt-0 border-t border-slate-100 mt-2 bg-slate-50/30">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6">
                            {/* Left Column: Details */}
                            <div className="space-y-6">
                              <div className="space-y-3">
                                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contacto del Cliente</h5>
                                <div className="grid grid-cols-1 gap-2">
                                  <a href={`tel:${apt.customer_phone}`} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors group">
                                    <div className="p-1.5 bg-slate-100 rounded-lg group-hover:bg-indigo-50 transition-colors">
                                      <Phone className="w-4 h-4 text-slate-500 group-hover:text-indigo-500" />
                                    </div>
                                    {apt.customer_phone}
                                  </a>
                                  {apt.customer_email && (
                                    <a href={`mailto:${apt.customer_email}`} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors group">
                                      <div className="p-1.5 bg-slate-100 rounded-lg group-hover:bg-indigo-50 transition-colors">
                                        <Mail className="w-4 h-4 text-slate-500 group-hover:text-indigo-500" />
                                      </div>
                                      {apt.customer_email}
                                    </a>
                                  )}
                                </div>
                              </div>

                              {(apt.payment_method || apt.notes) && (
                                <div className="space-y-3">
                                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Información Adicional</h5>
                                  {apt.payment_method && (
                                    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 text-sm text-slate-600">
                                      <CreditCard className="w-4 h-4 text-slate-400" />
                                      <span>Método de pago: <span className="font-semibold text-slate-900 capitalize">{apt.payment_method === 'transfer' ? 'Transferencia' : apt.payment_method}</span></span>
                                    </div>
                                  )}
                                  {apt.notes && (
                                    <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100 text-sm text-amber-900">
                                      <MessageSquare className="w-4 h-4 text-amber-500 mt-0.5" />
                                      <p className="italic">"{apt.notes}"</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Right Column: Actions */}
                            <div className="space-y-6">
                              <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gestionar Cita</h5>
                              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                {/* Action Buttons Logic */}
                                {apt.status === 'pending' && (
                                  <div className="grid grid-cols-2 gap-3">
                                    <button onClick={() => updateStatus(apt.id, 'confirmed')} className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] transition-all">
                                      <CheckCircle className="w-4 h-4" /> Confirmar
                                    </button>
                                    <button onClick={() => updateStatus(apt.id, 'cancelled')} className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-all">
                                      <XCircle className="w-4 h-4" /> Cancelar
                                    </button>
                                  </div>
                                )}

                                {apt.status === 'confirmed' && (
                                  <div className="grid grid-cols-2 gap-3">
                                    <button onClick={() => updateStatus(apt.id, 'completed')} className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all">
                                      <CheckCircle className="w-4 h-4" /> Completar
                                    </button>
                                    <button onClick={() => updateStatus(apt.id, 'cancelled')} className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-all">
                                      <XCircle className="w-4 h-4" /> Cancelar
                                    </button>
                                  </div>
                                )}

                                {apt.status === 'cancelled' && (
                                  <button onClick={() => { setUncancelAppointmentId(apt.id); setShowUncancelModal(true); }} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all">
                                    <CheckCircle className="w-4 h-4" /> Descancelar (Reactivar)
                                  </button>
                                )}

                                {apt.status === 'completed' && (
                                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3 text-emerald-800 text-sm font-medium">
                                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                                    Esta cita ha sido completada con éxito.
                                  </div>
                                )}

                                {/* Calendar Download */}
                                {apt.status !== 'cancelled' && (
                                  <a href={`/api/appointments/${apt.id}/ics`} download className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 text-slate-600 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-100 hover:text-slate-900 transition-all mt-2">
                                    <Download className="w-4 h-4" /> Descargar para Calendario sin conexión
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {paginatedList.length > 0 && totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-8">
          <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm disabled:opacity-50 disabled:shadow-none hover:bg-slate-50 transition-all">
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 shadow-sm">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${currentPage === page ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {page}
              </button>
            ))}
          </div>
          <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm disabled:opacity-50 disabled:shadow-none hover:bg-slate-50 transition-all">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      )}

      {/* Uncancel Modal */}
      {showUncancelModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 transform scale-100 transition-all">
            <div className="flex items-center gap-4 mb-4">
              <div className="bg-blue-100 p-3 rounded-2xl">
                <CheckCircle className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Descancelar Cita</h3>
            </div>
            <p className="text-slate-500 text-sm mb-6">Por favor explica por qué estás reactivando esta cita. Esta nota se guardará en el historial.</p>

            <textarea
              value={uncancelReason}
              onChange={(e) => setUncancelReason(e.target.value)}
              placeholder="Escribe el motivo aquí..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-6 focus:ring-2 focus:ring-blue-500 outline-none resize-none min-h-[100px]"
            />

            <div className="flex gap-3">
              <button onClick={() => setShowUncancelModal(false)} className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition">Cancelar</button>
              <button onClick={handleUncancel} disabled={!uncancelReason.trim()} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 disabled:opacity-50 transition">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

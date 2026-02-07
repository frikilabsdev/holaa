import { useState, useEffect } from "react";
import { useParams } from "react-router";
import {
  Clock,
  MapPin,
  Phone,
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Search,
  User,
  Share2
} from "lucide-react";
import type { Service, ServiceVariant, BusinessConfig, Tenant, PaymentMethod, SocialNetwork, VisualCustomization } from "@/shared/types";
import { getSocialIcon } from "@/react-app/components/SocialIcons";
import ServiceDetailModal from "@/react-app/components/ServiceDetailModal";

interface PublicEmployee {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
}

interface TenantData {
  tenant: Tenant;
  config: BusinessConfig;
  customization?: VisualCustomization | null;
  social_networks?: SocialNetwork[];
}

export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [tenantData, setTenantData] = useState<TenantData | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ServiceVariant | null>(null);
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [isLoadingDates, setIsLoadingDates] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [whatsappConfirmationToCustomer, setWhatsappConfirmationToCustomer] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [detailModalService, setDetailModalService] = useState<Service | null>(null);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");

  // Paso actual para el indicador visual (1–4)
  const currentStep = bookingComplete
    ? 4
    : selectedService && selectedDate && selectedTime
      ? 3
      : selectedService
        ? 2
        : 1;

  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    notes: "",
  });

  useEffect(() => {
    fetchTenantData();
    fetchServices();
  }, [slug]);

  useEffect(() => {
    if (slug) {
      fetchPaymentMethods();
    }
  }, [slug]);

  useEffect(() => {
    if (selectedService && slug) {
      fetchEmployeesForService(selectedService.id);
      setSelectedEmployee(null);
    } else {
      setEmployees([]);
      setSelectedEmployee(null);
    }
  }, [selectedService, slug]);

  useEffect(() => {
    if (selectedService) {
      fetchAvailableDates();
      setSelectedDate("");
      setSelectedTime("");
      setAvailableSlots([]);
      setCurrentMonth(new Date());
    }
  }, [selectedService, selectedVariant, selectedEmployee]);

  // Abrir WhatsApp al negocio al mostrar la confirmación (si hay enlace)
  useEffect(() => {
    if (!bookingComplete || !whatsappUrl) return;
    const t = setTimeout(() => {
      window.open(whatsappUrl!, "_blank", "noopener,noreferrer");
    }, 800);
    return () => clearTimeout(t);
  }, [bookingComplete, whatsappUrl]);

  useEffect(() => {
    if (selectedService && selectedDate) {
      fetchAvailableSlots();
    } else {
      setAvailableSlots([]);
      setSelectedTime("");
    }
  }, [selectedService, selectedVariant, selectedEmployee, selectedDate]);

  const fetchTenantData = async () => {
    try {
      const response = await fetch(`/api/public/tenants/${slug}`);
      if (response.ok) {
        const data = await response.json();
        setTenantData(data);
      } else {
        setError("Negocio no encontrado");
      }
    } catch (error) {
      console.error("Error al cargar datos:", error);
      setError("Error al cargar la página");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await fetch(`/api/public/tenants/${slug}/services`);
      if (response.ok) {
        const data = await response.json();
        setServices(data);
      }
    } catch (error) {
      console.error("Error al cargar servicios:", error);
    }
  };

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch(`/api/public/tenants/${slug}/payment-methods`);
      if (response.ok) {
        const data = await response.json();
        setPaymentMethods(data);
        // No preseleccionar ningún método - el cliente debe elegir
        setSelectedPaymentMethod(null);
      }
    } catch (error) {
      console.error("Error al cargar métodos de pago:", error);
    }
  };

  const fetchEmployeesForService = async (serviceId: number) => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/public/tenants/${slug}/services/${serviceId}/employees`);
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      } else {
        setEmployees([]);
      }
    } catch {
      setEmployees([]);
    }
  };

  const fetchAvailableDates = async () => {
    if (!selectedService) return;
    setIsLoadingDates(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedVariant?.id) params.set("service_variant_id", String(selectedVariant.id));
      if (selectedEmployee != null) params.set("employee_id", String(selectedEmployee));
      const url = `/api/public/services/${selectedService.id}/available-dates${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setAvailableDates(Array.isArray(data) ? data : []);
      } else {
        const body = await response.json().catch(() => ({}));
        const msg = body?.message || body?.error || `Error ${response.status} al cargar fechas`;
        setError(msg);
        setAvailableDates([]);
      }
    } catch (err) {
      console.error("Error al cargar fechas disponibles:", err);
      setError("No se pudieron cargar las fechas. Intenta de nuevo.");
      setAvailableDates([]);
    } finally {
      setIsLoadingDates(false);
    }
  };

  const fetchAvailableSlots = async () => {
    if (!selectedService || !selectedDate) return;
    setIsLoadingSlots(true);
    setError("");
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (selectedVariant?.id) params.set("service_variant_id", String(selectedVariant.id));
      if (selectedEmployee != null) params.set("employee_id", String(selectedEmployee));
      const response = await fetch(`/api/public/services/${selectedService.id}/slots?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableSlots(Array.isArray(data) ? data : []);
      } else {
        const body = await response.json().catch(() => ({}));
        const msg = body?.message || body?.error || `Error ${response.status} al cargar horarios`;
        setError(msg);
        setAvailableSlots([]);
      }
    } catch (err) {
      console.error("Error al cargar horarios:", err);
      setError("No se pudieron cargar los horarios. Intenta de nuevo.");
      setAvailableSlots([]);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || !selectedDate || !selectedTime || !tenantData) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/public/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantData.tenant.id,
          service_id: selectedService.id,
          service_variant_id: selectedVariant?.id ?? null,
          employee_id: selectedEmployee ?? null,
          appointment_date: selectedDate,
          appointment_time: selectedTime,
          payment_method: selectedPaymentMethod?.method_type || null,
          ...formData,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setBookingComplete(true);
        setWhatsappUrl(data.whatsapp_url ?? null);
        setWhatsappConfirmationToCustomer(data.whatsapp_confirmation_to_customer ?? null);
        // WhatsApp se abre en el useEffect al mostrar la pantalla de confirmación
      } else {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData?.message || errorData?.error || `Error ${response.status} al crear la cita`;
        setError(msg);
      }
    } catch (err) {
      console.error("Error al crear cita:", err);
      setError("Error al procesar la reserva. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetBooking = () => {
    setBookingComplete(false);
    setWhatsappUrl(null);
    setWhatsappConfirmationToCustomer(null);
    setSelectedService(null);
    setSelectedVariant(null);
    setSelectedEmployee(null);
    setSelectedDate("");
    setSelectedTime("");
    setFormData({
      customer_name: "",
      customer_phone: "",
      customer_email: "",
      notes: "",
    });
    setSelectedPaymentMethod(null);
  };

  const hasAvailableSlots = (date: string) => {
    return availableDates.includes(date);
  };

  // --- Dynamic Color & Style Helpers ---
  const custom = tenantData?.customization;
  const primaryColor = custom?.primary_color || "#3b82f6";
  const textColor = custom?.text_color || "#1f2937";
  const titleColor = custom?.service_title_color || "#111827";

  const getBackgroundStyle = (): React.CSSProperties => {
    if (!custom) return {};
    if (custom.background_type === "gradient") {
      return { background: `linear-gradient(135deg, ${custom.background_gradient_start || "#ffffff"} 0%, ${custom.background_gradient_end || "#ffffff"} 100%)` };
    } else if (custom.background_type === "image" && custom.background_image_url) {
      return { backgroundImage: `url(${custom.background_image_url})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" };
    } else {
      return { backgroundColor: custom.background_color || "#f8fafc" };
    }
  };

  // --- Layout Wrappers ---
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error && !tenantData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Algo salió mal</h1>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div className="min-h-screen font-sans selection:bg-black/10 text-slate-900" style={{ ...getBackgroundStyle() }}>
      {/* Responsive Container: Full screen on mobile, Professional Card on Desktop */}
      <div className="mx-auto min-h-screen bg-white relative shadow-none md:shadow-2xl md:max-w-2xl lg:max-w-4xl md:my-8 lg:my-12 md:rounded-[2rem] transition-all duration-300 flex flex-col">

        {/* --- Header / Hero Section --- */}
        {!selectedService && !bookingComplete && (
          <div className="relative">
            {/* Cover Image */}
            <div className="h-40 sm:h-56 md:h-64 lg:h-72 overflow-hidden bg-slate-200 md:rounded-t-[2rem]">
              {tenantData?.config.header_image_url ? (
                <img src={tenantData.config.header_image_url} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300"></div>
              )}
              {/* Dark overlay for text contrast inside header if needed, but we use cards below */}
            </div>

            {/* Profile Content (overlapping) */}
            <div className="px-6 -mt-12 relative z-10 mb-8">
              <div className="flex flex-col items-center text-center">
                <div className="p-1.5 bg-white rounded-full shadow-lg mb-3">
                  {tenantData?.config.profile_image_url ? (
                    <img src={tenantData.config.profile_image_url} alt="Profile" className="w-24 h-24 rounded-full object-cover border border-slate-100" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center text-3xl font-bold text-slate-400">
                      {tenantData?.config.business_name?.[0] || "B"}
                    </div>
                  )}
                </div>

                <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: titleColor }}>
                  {tenantData?.config.business_name}
                </h1>

                {tenantData?.config.address && (
                  <p className="flex items-center gap-1.5 text-sm font-medium opacity-80 mb-4" style={{ color: textColor }}>
                    <MapPin className="w-3.5 h-3.5" />
                    {tenantData.config.address}
                  </p>
                )}

                {/* Social Pills */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {tenantData?.config.phone && (
                    <a href={`tel:${tenantData.config.phone}`} className="p-2.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                  {tenantData?.config.whatsapp && (
                    <a href={`https://wa.me/${tenantData.config.whatsapp.replace(/[^0-9]/g, "")}`} className="p-2.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}
                  {tenantData?.social_networks?.map(social => {
                    const Icon = getSocialIcon(social.platform);
                    return (
                      <a key={social.id} href={social.url} target="_blank" rel="noopener" className="p-2.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                        <Icon className="w-4 h-4" />
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- Navigation Header (Back Button) --- */}
        {selectedService && !bookingComplete && (
          <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <button
              onClick={() => {
                if (currentStep === 3) setSelectedTime("");
                else if (currentStep === 2) {
                  if (selectedDate && !selectedTime) setSelectedDate("");
                  else setSelectedService(null);
                }
              }}
              className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-slate-700" />
            </button>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-slate-900 truncate">
                {currentStep === 2 ? (selectedDate ? "Seleccionar Hora" : "Seleccionar Fecha") : "Tus Datos"}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {selectedService.title} {selectedVariant ? `• ${selectedVariant.name}` : ""}
              </p>
            </div>
          </div>
        )}


        {/* --- Step 1: Services List --- */}
        {!selectedService && !bookingComplete && (
          <div className="px-6 pb-24 space-y-8 animate-fade-in-up">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar servicios..."
                value={serviceSearchQuery}
                onChange={(e) => setServiceSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-400 font-medium transition-all"
              />
            </div>

            {/* Contact/Action Section used to explain flow */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Servicios</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services
                  .filter(s => {
                    if (!serviceSearchQuery) return true;
                    const q = serviceSearchQuery.toLowerCase();
                    return s.title.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q);
                  })
                  .map(service => (
                    <div
                      key={service.id}
                      onClick={() => setDetailModalService(service)}
                      className="group bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-slate-300 hover:shadow-md transition-all cursor-pointer flex gap-4 items-start active:scale-[0.98]"
                    >
                      {/* Service Image */}
                      <div className="w-20 h-20 rounded-xl bg-slate-100 flex-shrink-0 overflow-hidden">
                        {service.main_image_url ? (
                          <img src={service.main_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold text-xl" style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
                            {service.title[0]}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 py-1">
                        <h4 className="font-bold text-slate-900 truncate mb-1">{service.title}</h4>
                        <p className="text-sm text-slate-500 line-clamp-2 mb-2 leading-relaxed">
                          {service.description || "Sin descripción"}
                        </p>
                        <div className="flex items-center gap-3 text-xs font-semibold">
                          <span className="text-slate-900 bg-slate-100 px-2 py-1 rounded-md">
                            {service.price ? `$${service.price}` : "Variable"}
                          </span>
                          {service.duration_minutes && (
                            <span className="flex items-center gap-1 text-slate-500">
                              <Clock className="w-3 h-3" />
                              {service.duration_minutes} min
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 mt-2 flex-shrink-0" />
                    </div>
                  ))
                }
                {services.length === 0 && (
                  <div className="text-center py-12 text-slate-400">
                    <p>No se encontraron servicios</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- Step 2: Calendar & Time --- */}
        {selectedService && !bookingComplete && (
          <div className="px-5 py-6 pb-32 animate-fade-in-up">

            {/* Employee Selection (Horizontal Scroll) */}
            {employees.length > 0 && !selectedDate && (
              <div className="mb-8">
                <h3 className="text-sm font-bold text-slate-900 mb-3 px-1">¿Con quién?</h3>
                <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 snap-x">
                  <button
                    onClick={() => setSelectedEmployee(null)}
                    className={`snap-start flex-shrink-0 px-5 py-3 rounded-2xl border font-medium text-sm transition-all whitespace-nowrap ${selectedEmployee === null
                      ? 'bg-slate-900 text-white border-transparent shadow-lg shadow-slate-900/20'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                  >
                    Cualquiera
                  </button>
                  {employees.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => setSelectedEmployee(emp.id)}
                      className={`snap-start flex-shrink-0 px-5 py-3 rounded-2xl border font-medium text-sm transition-all whitespace-nowrap ${selectedEmployee === emp.id
                        ? 'bg-slate-900 text-white border-transparent shadow-lg shadow-slate-900/20'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                    >
                      {emp.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Calendar View */}
            {!selectedDate && (
              <div className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-900 capitalize">
                    {currentMonth.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
                  </h3>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 hover:bg-slate-100 rounded-full">
                      <ChevronLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 hover:bg-slate-100 rounded-full">
                      <ChevronRight className="w-5 h-5 text-slate-600" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-y-4 mb-2">
                  {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
                    <div key={i} className="text-center text-xs font-bold text-slate-400">{d}</div>
                  ))}
                  {/* Calendar generation logic reused visually */}
                  {(() => {
                    const year = currentMonth.getFullYear();
                    const month = currentMonth.getMonth();
                    const firstDay = new Date(year, month, 1).getDay();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const days = [];

                    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} />);

                    const todayStr = new Date().toISOString().split('T')[0];

                    for (let d = 1; d <= daysInMonth; d++) {
                      const date = new Date(year, month, d);
                      const dateStr = date.toISOString().split('T')[0];
                      const available = hasAvailableSlots(dateStr);
                      const isToday = dateStr === todayStr;

                      days.push(
                        <button
                          key={d}
                          disabled={!available}
                          onClick={() => setSelectedDate(dateStr)}
                          className={`w-10 h-10 mx-auto flex items-center justify-center rounded-full text-sm font-medium transition-all relative
                                      ${available
                              ? 'text-slate-900 hover:bg-slate-50 cursor-pointer'
                              : 'text-slate-300 cursor-not-allowed line-through- decoration-slate-300'
                            }
                                      ${isToday ? 'bg-slate-100 font-bold text-slate-900' : ''}
                                   `}
                        >
                          {d}
                          {available && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-green-500 rounded-full"></span>}
                        </button>
                      );
                    }
                    return days;
                  })()}
                </div>
                {isLoadingDates && <div className="text-center py-4 text-xs text-slate-400 font-medium animate-pulse">Cargando disponibilidad...</div>}
              </div>
            )}

            {/* Time Slots View */}
            {selectedDate && !selectedTime && (
              <div className="animate-fade-in-up">
                <h3 className="text-lg font-bold text-slate-900 mb-4 px-1">
                  Horarios disponibles
                  <span className="block text-sm font-normal text-slate-500 mt-1">
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                </h3>

                {isLoadingSlots ? (
                  <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
                ) : availableSlots.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {availableSlots.map(time => (
                      <button
                        key={time}
                        onClick={() => setSelectedTime(time)}
                        className="py-3 px-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-semibold text-sm shadow-sm hover:border-slate-900 hover:shadow-md transition-all focus:ring-2 focus:ring-slate-900 active:scale-95"
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                    <p className="text-slate-400 font-medium">No hay horarios disponibles</p>
                    <button onClick={() => setSelectedDate("")} className="mt-4 text-sm font-bold text-slate-900 underline">Elegir otra fecha</button>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Form */}
            {selectedTime && (
              <div className="animate-fade-in-up">
                <div className="bg-slate-50 rounded-2xl p-4 mb-6 flex gap-4 items-center">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-900">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Resumiendo</p>
                    <p className="text-slate-900 font-semibold leading-tight">
                      {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} • {selectedTime}
                    </p>
                    <p className="text-sm text-slate-600 truncate max-w-[200px]">{selectedService.title}</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-4">
                    <div className="relative">
                      <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                      <input
                        required
                        value={formData.customer_name}
                        onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
                        placeholder="Tu nombre completo"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-transparent rounded-2xl focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-100 transition-all font-medium placeholder:text-slate-400"
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                      <input
                        required
                        type="tel"
                        value={formData.customer_phone}
                        onChange={e => setFormData({ ...formData, customer_phone: e.target.value })}
                        placeholder="Teléfono (WhatsApp)"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-transparent rounded-2xl focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-100 transition-all font-medium placeholder:text-slate-400"
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 flex items-center justify-center font-serif italic font-bold">@</div>
                      <input
                        type="email"
                        value={formData.customer_email}
                        onChange={e => setFormData({ ...formData, customer_email: e.target.value })}
                        placeholder="Email (opcional)"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-transparent rounded-2xl focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-100 transition-all font-medium placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* Payment Method Selection */}
                  {paymentMethods.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-900">Método de pago</h3>
                      <div className="grid grid-cols-1 gap-3">
                        {paymentMethods.map(method => {
                          const isSelected = selectedPaymentMethod?.id === method.id;
                          return (
                            <div
                              key={method.id}
                              onClick={() => setSelectedPaymentMethod(method)}
                              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${isSelected
                                ? 'bg-slate-900 border-transparent text-white shadow-md'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-white' : 'border-slate-300'}`}>
                                  {isSelected && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                                </div>
                                <span className="font-medium">
                                  {method.method_type === 'cash' && 'Efectivo'}
                                  {method.method_type === 'card' && 'Tarjeta (en local)'}
                                  {method.method_type === 'transfer' && 'Transferencia'}
                                  {!['cash', 'card', 'transfer'].includes(method.method_type) && method.method_type}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Payment Details / Notices */}
                      {selectedPaymentMethod?.method_type === 'transfer' && (
                        <div className="p-4 bg-blue-50 rounded-2xl text-sm text-blue-900 border border-blue-100">
                          <p className="font-bold mb-2">Datos bancarios:</p>
                          <div className="space-y-1 opacity-90">
                            {selectedPaymentMethod.account_holder_name && <p>Titular: {selectedPaymentMethod.account_holder_name}</p>}
                            {selectedPaymentMethod.account_number && <p>Cuenta: {selectedPaymentMethod.account_number}</p>}
                            {selectedPaymentMethod.clabe && <p>CLABE: {selectedPaymentMethod.clabe}</p>}
                          </div>
                          <p className="mt-3 text-xs opacity-70">
                            * Deberás enviar el comprobante por WhatsApp para confirmar.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  <textarea
                    rows={3}
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="¿Algún comentario o preferencia para tu cita?"
                    className="w-full px-4 py-3 bg-slate-50 border border-transparent rounded-2xl focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-100 transition-all font-medium placeholder:text-slate-400 resize-none"
                  />

                  {/* Sticky Bottom Action Button for Mobile, Inline for Desktop */}
                  <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 md:static md:p-0 md:bg-transparent md:border-0 z-50 md:mt-8">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-slate-900 text-white font-bold text-lg py-4 rounded-2xl shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                      Confirmar Reserva
                    </button>
                  </div>
                  {/* Spacer for sticky button */}
                  <div className="h-20"></div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* --- Step 4: Success / Booking Complete --- */}
        {bookingComplete && (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-fade-in-up">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-green-200 shadow-xl">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">¡Reserva Lista!</h2>
            <p className="text-slate-500 mb-8 max-w-xs mx-auto">
              Te esperamos el <span className="text-slate-900 font-bold">{new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' })}</span> a las <span className="text-slate-900 font-bold">{selectedTime}</span>.
            </p>

            <div className="w-full space-y-3 mb-8">
              {whatsappUrl && (
                <a href={whatsappUrl} target="_blank" rel="noopener" className="w-full flex items-center justify-center gap-2 py-4 bg-[#25D366] text-white rounded-2xl font-bold shadow-lg shadow-green-500/20 hover:scale-[1.02] transition-transform">
                  <MessageCircle className="w-5 h-5" />
                  Enviar confirmación por WhatsApp
                </a>
              )}
              {whatsappConfirmationToCustomer && (
                <a href={whatsappConfirmationToCustomer} target="_blank" rel="noopener" className="w-full flex items-center justify-center gap-2 py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-colors">
                  <Share2 className="w-5 h-5" />
                  Guardar mi comprobante
                </a>
              )}
            </div>

            <button onClick={resetBooking} className="text-slate-400 font-medium text-sm hover:text-slate-600 transition-colors">
              Hacer otra reserva
            </button>
          </div>
        )}

        {/* Modal Logic Reuse */}
        <ServiceDetailModal
          isOpen={!!detailModalService}
          onClose={() => setDetailModalService(null)}
          service={detailModalService}
          onSelectService={(service, variant) => {
            setSelectedService(service);
            setSelectedVariant(variant);
            setDetailModalService(null);
          }}
          // Fix 1: custom colors prop
          customColors={custom ? {
            primary_color: custom.primary_color || undefined,
            secondary_color: custom.secondary_color || undefined,
            card_background_color: custom.card_background_color || undefined,
            card_border_color: custom.card_border_color || undefined,
            service_title_color: custom.service_title_color || undefined,
            text_color: custom.text_color || undefined,
            time_text_color: custom.time_text_color || undefined,
            price_color: custom.price_color || undefined,
          } : undefined}
        // Fix 2: Remove usage of bookingEmployeeName from handleSubmit (around line 271) 
        // and resetBooking (around line 290)
        // To do this via Replace, I will target the specific blocks.

        />
      </div>
    </div>
  );
}

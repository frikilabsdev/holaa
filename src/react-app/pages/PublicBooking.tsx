import { useState, useEffect } from "react";
import { useParams } from "react-router";
import {
  Calendar,
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
} from "lucide-react";
import type { Service, ServiceVariant, BusinessConfig, Tenant, PaymentMethod, SocialNetwork, VisualCustomization } from "@/shared/types";

interface PublicEmployee {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
}
import { getSocialIcon } from "@/react-app/components/SocialIcons";
import ServiceDetailModal from "@/react-app/components/ServiceDetailModal";

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
  const [currentTimePage, setCurrentTimePage] = useState(0);
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
  const [error, setError] = useState("");
  const [detailModalService, setDetailModalService] = useState<Service | null>(null);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [employeeSchedule, setEmployeeSchedule] = useState<Array<{ day_of_week: number; start_time: string; end_time: string }> | null>(null);

  // Paso actual para el indicador visual (1–4)
  const currentStep = bookingComplete
    ? 4
    : selectedService && selectedDate && selectedTime
      ? 3
      : selectedService
        ? 2
        : 1;
  const stepLabels = ["Servicio", "Fecha y hora", "Tus datos", "Confirmación"];

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
      setCurrentTimePage(0);
      setAvailableSlots([]);
      setCurrentMonth(new Date());
    }
  }, [selectedService, selectedVariant, selectedEmployee]);

  useEffect(() => {
    if (selectedService && selectedDate) {
      fetchAvailableSlots();
    } else {
      setAvailableSlots([]);
      setSelectedTime("");
      setCurrentTimePage(0);
    }
  }, [selectedService, selectedVariant, selectedEmployee, selectedDate]);

  useEffect(() => {
    if (!slug || !selectedService || selectedEmployee == null) {
      setEmployeeSchedule(null);
      return;
    }
    const abort = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/public/tenants/${slug}/services/${selectedService.id}/employees/${selectedEmployee}/schedules`,
          { signal: abort.signal }
        );
        if (res.ok) {
          const data = await res.json();
          setEmployeeSchedule(Array.isArray(data) ? data : []);
        } else {
          setEmployeeSchedule([]);
        }
      } catch {
        if (!abort.signal.aborted) setEmployeeSchedule([]);
      }
    })();
    return () => abort.abort();
  }, [slug, selectedService?.id, selectedEmployee]);

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
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (selectedVariant?.id) params.set("service_variant_id", String(selectedVariant.id));
      if (selectedEmployee != null) params.set("employee_id", String(selectedEmployee));
      const response = await fetch(`/api/public/services/${selectedService.id}/slots?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableSlots(data);
        setCurrentTimePage(0); // Resetear a la primera página cuando cambian los slots
      }
    } catch (error) {
      console.error("Error al cargar horarios:", error);
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
        
        // Open WhatsApp automatically if URL is provided
        if (data.whatsapp_url) {
          setWhatsappUrl(data.whatsapp_url);
          // Open WhatsApp in a new window after 1.5 seconds
          setTimeout(() => {
            window.open(data.whatsapp_url, "_blank");
          }, 1500);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Error al crear la cita");
      }
    } catch (error) {
      console.error("Error al crear cita:", error);
      setError("Error al procesar la reserva");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetBooking = () => {
    setBookingComplete(false);
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

  // Check if a date has available slots
  const hasAvailableSlots = (date: string) => {
    return availableDates.includes(date);
  };

  // Get dynamic styles based on customization
  const getBackgroundStyle = (): React.CSSProperties => {
    const custom = tenantData?.customization;
    if (!custom) {
      return {};
    }

    if (custom.background_type === "gradient") {
      return {
        background: `linear-gradient(135deg, ${custom.background_gradient_start || "#ffffff"} 0%, ${custom.background_gradient_end || "#ffffff"} 100%)`,
      };
    } else if (custom.background_type === "image" && custom.background_image_url) {
      return {
        backgroundImage: `url(${custom.background_image_url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      };
    } else {
      return {
        backgroundColor: custom.background_color || "#ffffff",
      };
    }
  };

  const custom = tenantData?.customization;

  const primaryColor = custom?.primary_color || "#3b82f6";
  const secondaryColor = custom?.secondary_color || "#8b5cf6";
  const backgroundColor = custom?.background_color || "#ffffff";
  const textColor = custom?.text_color || "#1f2937";

  if (isLoading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          background: custom?.background_type === "gradient" && custom?.background_gradient_start && custom?.background_gradient_end
            ? `linear-gradient(135deg, ${custom.background_gradient_start} 0%, ${custom.background_gradient_end} 100%)`
            : custom?.background_type === "image" && custom?.background_image_url
            ? `url(${custom.background_image_url}) center/cover no-repeat`
            : backgroundColor,
        }}
      >
        <div 
          className="animate-spin rounded-full h-12 w-12 border-b-2"
          style={{ borderTopColor: primaryColor }}
        ></div>
      </div>
    );
  }

  if (error && !tenantData) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          background: custom?.background_type === "gradient" && custom?.background_gradient_start && custom?.background_gradient_end
            ? `linear-gradient(135deg, ${custom.background_gradient_start} 0%, ${custom.background_gradient_end} 100%)`
            : custom?.background_type === "image" && custom?.background_image_url
            ? `url(${custom.background_image_url}) center/cover no-repeat`
            : backgroundColor,
        }}
      >
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Página no encontrada
          </h1>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (bookingComplete) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          background: custom?.background_type === "gradient" && custom?.background_gradient_start && custom?.background_gradient_end
            ? `linear-gradient(135deg, ${custom.background_gradient_start} 0%, ${custom.background_gradient_end} 100%)`
            : custom?.background_type === "image" && custom?.background_image_url
            ? `url(${custom.background_image_url}) center/cover no-repeat`
            : backgroundColor,
        }}
      >
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <p className="text-sm font-medium mb-2" style={{ color: primaryColor }}>
            Paso 4 de 4: Confirmación
          </p>
          <div 
            className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
            }}
          >
            <CheckCircle className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            ¡Reserva Confirmada!
          </h2>
          <p className="text-slate-600 mb-6">
            Tu cita ha sido agendada exitosamente
          </p>

          <div 
            className="rounded-xl p-4 mb-6 text-left"
            style={{
              backgroundColor: `${primaryColor}10`,
              borderColor: `${primaryColor}30`,
              borderWidth: "1px",
              borderStyle: "solid",
            }}
          >
            <div className="space-y-2 text-sm" style={{ color: textColor }}>
              <div>
                <span className="font-semibold">Servicio:</span>{" "}
                {selectedService?.title}
              </div>
              <div>
                <span className="font-semibold">Fecha:</span>{" "}
                {new Date(selectedDate + "T00:00:00").toLocaleDateString("es-MX", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
              <div>
                <span className="font-semibold">Hora:</span>{" "}
                {selectedTime}
              </div>
            </div>
          </div>

          {whatsappUrl && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-green-800 mb-2 flex items-center justify-center space-x-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span>Tu mensaje de confirmación se está enviando por WhatsApp</span>
              </p>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-700 underline hover:text-green-900 block mt-2"
              >
                Si no se abrió automáticamente, haz clic aquí
              </a>
            </div>
          )}

          <button
            onClick={resetBooking}
            className="w-full px-6 py-3 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
              boxShadow: `0 10px 15px -3px ${primaryColor}30, 0 4px 6px -2px ${primaryColor}20`,
            }}
          >
            Generar otra cita
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={getBackgroundStyle()}>
      {/* Header Image (Linktree style) */}
      {tenantData?.config.header_image_url && tenantData.config.header_image_url.trim() !== "" && (
        <div className="relative w-full h-48 sm:h-64 overflow-hidden">
          <img
            src={tenantData.config.header_image_url}
            alt="Header"
            className="w-full h-full object-cover"
            onError={(e) => {
              console.error("Error al cargar imagen de cabecera:", tenantData.config.header_image_url);
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      {/* Profile Section (Linktree style) */}
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto px-4 -mt-12 sm:-mt-16 relative z-10">
        <div 
          className="rounded-2xl shadow-lg p-6 sm:p-8 text-center"
          style={{
            backgroundColor: custom?.card_background_color || "#ffffff",
            borderColor: custom?.card_border_color || "#e5e7eb",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          {/* Profile Image */}
          <div className="mb-4">
            {tenantData?.config.profile_image_url && tenantData.config.profile_image_url.trim() !== "" ? (
              <img
                src={tenantData.config.profile_image_url}
                alt={tenantData?.config.business_name || "Perfil"}
                className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-full mx-auto border-4 border-white shadow-xl object-cover"
                onError={(e) => {
                  console.error("Error al cargar imagen de perfil:", tenantData.config.profile_image_url);
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div 
                className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-full mx-auto border-4 border-white shadow-xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                }}
              >
                <span className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
                  {tenantData?.config.business_name?.[0]?.toUpperCase() || "R"}
                </span>
              </div>
            )}
          </div>

          {/* Business Name */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2" style={{ color: custom?.service_title_color || "#111827" }}>
                {tenantData?.config.business_name || "Reserva tu Cita"}
              </h1>

          {/* Address */}
              {tenantData?.config.address && (
            <p className="text-sm sm:text-base flex items-center justify-center mb-6" style={{ color: custom?.text_color || "#6b7280" }}>
                  <MapPin className="w-4 h-4 mr-1" />
                  {tenantData.config.address}
                </p>
              )}

          {/* Social Networks (Linktree style) */}
          {tenantData?.social_networks && tenantData.social_networks.length > 0 && (
            <div className="flex items-center justify-center space-x-3 mb-6 pb-6 border-b border-slate-200">
              {tenantData.social_networks.map((social) => {
                const IconComponent = getSocialIcon(social.platform);
                return (
                  <a
                    key={social.id}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 hover:bg-blue-100 flex items-center justify-center transition-colors text-slate-600 hover:text-blue-600 group"
                    title={social.platform}
                  >
                    <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />
                  </a>
                );
              })}
              </div>
          )}

          {/* Contact Info */}
          {(tenantData?.config.phone || tenantData?.config.whatsapp) && (
            <div className="flex items-center justify-end space-x-4 pt-2">
              {tenantData.config.phone && (
                <a
                  href={`tel:${tenantData.config.phone}`}
                  className="flex items-center space-x-2 text-sm text-slate-600 hover:text-blue-600 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  <span>{tenantData.config.phone}</span>
                </a>
              )}
              {tenantData.config.whatsapp && (
                <a
                  href={`https://wa.me/${tenantData.config.whatsapp.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-sm text-slate-600 hover:text-green-600 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>WhatsApp</span>
                </a>
              )}
              </div>
          )}
          </div>
        </div>

      {/* Búsqueda rápida de servicios (debajo de la tarjeta del negocio) */}
      {!selectedService && services.length > 0 && (
        <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto px-4 pt-4">
          <div
            className="relative rounded-xl shadow-md overflow-hidden"
            style={{
              backgroundColor: custom?.card_background_color || "#ffffff",
              borderColor: custom?.card_border_color || "#e5e7eb",
              borderWidth: "1px",
              borderStyle: "solid",
            }}
          >
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
              style={{ color: custom?.time_text_color || "#9ca3af" }}
            />
            <input
              type="text"
              placeholder="Buscar servicios..."
              value={serviceSearchQuery}
              onChange={(e) => setServiceSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 text-base bg-transparent focus:outline-none placeholder-slate-400"
              style={{
                color: custom?.service_title_color || "#111827",
              }}
              aria-label="Buscar servicios"
            />
          </div>
        </div>
      )}

      <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto px-4 py-6 sm:py-8">

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Indicador de pasos (stepper) */}
        <div className="mb-6" aria-label={`Paso ${currentStep} de 4`}>
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            {[1, 2, 3, 4].map((step) => {
              const isActive = step === currentStep;
              const isDone = step < currentStep;
              const primaryColor = custom?.primary_color || "#3b82f6";
              return (
                <div key={step} className="flex items-center">
                  <div
                    className={`flex items-center justify-center rounded-full text-sm font-semibold transition-all ${
                      isDone ? "opacity-90" : isActive ? "ring-2 ring-offset-2" : "opacity-50"
                    }`}
                    style={{
                      width: "2rem",
                      height: "2rem",
                      backgroundColor: isDone || isActive ? primaryColor : (custom?.card_border_color || "#e5e7eb"),
                      color: isDone || isActive ? "#fff" : (custom?.text_color || "#6b7280"),
                      ...(isActive && { boxShadow: `0 0 0 2px ${primaryColor}40` }),
                    }}
                  >
                    {isDone ? <CheckCircle className="w-4 h-4" /> : step}
                  </div>
                  <span
                    className={`hidden sm:inline ml-1 text-xs font-medium md:text-sm ${
                      isActive ? "font-semibold" : ""
                    }`}
                    style={{
                      color: isActive ? (custom?.service_title_color || "#111827") : (custom?.text_color || "#6b7280"),
                    }}
                  >
                    {stepLabels[step - 1]}
                  </span>
                  {step < 4 && (
                    <div
                      className="w-4 sm:w-8 h-0.5 mx-0.5 sm:mx-1 rounded"
                      style={{
                        backgroundColor: isDone ? primaryColor : (custom?.card_border_color || "#e5e7eb"),
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-center mt-2 text-sm sm:hidden" style={{ color: custom?.text_color || "#6b7280" }}>
            Paso {currentStep} de 4
          </p>
        </div>

        {/* Step 1: Select Service (Linktree style cards) */}
        {!selectedService && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold mb-1" style={{ color: custom?.service_title_color || "#111827" }}>
              Paso 1 de 4: Servicio
            </h2>
            <p className="text-sm mb-4" style={{ color: custom?.text_color || "#6b7280" }}>
              Elige el servicio que quieres agendar
            </p>
            {services
              .filter((service) => {
                const q = serviceSearchQuery.trim().toLowerCase();
                if (!q) return true;
                const matchTitle = service.title.toLowerCase().includes(q);
                const matchDesc = service.description?.toLowerCase().includes(q);
                return matchTitle || matchDesc;
              })
              .map((service) => {
              const descriptionSummary = service.description
                ? (service.description.length > 120 ? service.description.substring(0, 120) + "..." : service.description)
                : null;
              
              return (
              <button
                key={service.id}
                onClick={() => setDetailModalService(service)}
                className="w-full rounded-2xl shadow-lg p-5 sm:p-6 hover:shadow-2xl hover:scale-[1.02] transition-all text-left group relative overflow-hidden"
                style={{
                  backgroundColor: custom?.card_background_color || "#ffffff",
                  borderColor: custom?.card_border_color || "#e5e7eb",
                  borderWidth: "1px",
                  borderStyle: "solid",
                }}
              >
                {/* Gradient background on hover */}
                <div 
                  className="absolute inset-0 transition-all pointer-events-none opacity-0 group-hover:opacity-5"
                  style={{
                    background: custom ? `linear-gradient(135deg, ${custom.primary_color || "#3b82f6"} 0%, ${custom.secondary_color || "#8b5cf6"} 100%)` : "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
                  }}
                />
                
                <div className="relative flex items-start space-x-4">
                  {/* Main Image (Circle) */}
                  {service.main_image_url ? (
                    <img
                      src={service.main_image_url}
                      alt={service.title}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 flex-shrink-0"
                      style={{ borderColor: custom?.card_border_color || "#e5e7eb" }}
                    />
                  ) : (
                    <div
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xl sm:text-2xl"
                      style={{
                        backgroundColor: custom?.primary_color || "#3b82f6",
                      }}
                    >
                      {service.title[0]?.toUpperCase() || "S"}
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <h3 
                        className="text-lg sm:text-xl font-bold group-hover:opacity-80 transition-opacity pr-2"
                        style={{ color: custom?.service_title_color || "#111827" }}
                      >
                  {service.title}
                </h3>
                      <ChevronRight 
                        className="w-5 h-5 flex-shrink-0 mt-1 transition-colors" 
                        style={{ color: custom?.primary_color || "#6366f1" }}
                      />
                    </div>
                    
                    {descriptionSummary && (
                      <p className="text-sm mb-4 line-clamp-2" style={{ color: custom?.text_color || "#6b7280" }}>
                        {descriptionSummary}
                      </p>
                    )}
                      
                    <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: custom?.card_border_color || "#e5e7eb" }}>
                      <div className="flex items-center space-x-4 text-sm" style={{ color: custom?.time_text_color || "#6b7280" }}>
                    {service.variants?.length ? (
                      (() => {
                        const mins = service.variants.map((v) => v.duration_minutes).filter((d): d is number => d != null);
                        return mins.length > 0 ? (
                          <div className="flex items-center space-x-1.5">
                            <Clock className="w-4 h-4" />
                            <span>{Math.min(...mins)} min</span>
                          </div>
                        ) : null;
                      })()
                    ) : service.duration_minutes != null ? (
                          <div className="flex items-center space-x-1.5">
                        <Clock className="w-4 h-4" />
                        <span>{service.duration_minutes} min</span>
                      </div>
                    ) : null}
                      </div>
                    {(service.variants?.length ? service.variants.length > 0 : service.price != null) && (
                        <div className="font-bold text-lg" style={{ color: custom?.price_color || "#059669" }}>
                        {service.variants?.length
                          ? `desde $${Math.min(...service.variants.map((v) => v.price)).toFixed(2)}`
                          : `$${service.price!.toFixed(2)}`}
                      </div>
                    )}
                  </div>
                  </div>
                </div>
              </button>
            )})}
          </div>
        )}

        {/* Service Detail Modal */}
        <ServiceDetailModal
          isOpen={!!detailModalService}
          onClose={() => setDetailModalService(null)}
          service={detailModalService}
          onSelectService={(service, variant) => {
            setSelectedService(service);
            setSelectedVariant(variant);
            setDetailModalService(null);
          }}
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
        />

        {/* Step 2: Select Date and Time */}
        {selectedService && !selectedDate && (
          <div 
            className="rounded-2xl shadow-xl p-6"
            style={{
              backgroundColor: custom?.card_background_color || "#ffffff",
              borderColor: custom?.card_border_color || "#e5e7eb",
              borderWidth: "1px",
              borderStyle: "solid",
            }}
          >
            <h2 className="text-xl font-bold mb-1" style={{ color: custom?.service_title_color || "#111827" }}>
              Paso 2 de 4: Fecha y hora
            </h2>
            <p className="text-sm mb-4" style={{ color: custom?.text_color || "#6b7280" }}>
              Elige el día y la hora disponibles para tu cita
            </p>
            <button
              onClick={() => { setSelectedService(null); setSelectedVariant(null); setSelectedEmployee(null); }}
              className="flex items-center space-x-2 mb-4 transition-colors"
              style={{ 
                color: custom?.text_color || "#6b7280",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = primaryColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = custom?.text_color || "#6b7280";
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Cambiar servicio</span>
            </button>

            {employees.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: custom?.service_title_color || "#111827" }}>
                  <User className="w-4 h-4" />
                  ¿Con qué empleado?
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedEmployee(null)}
                    className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${
                      selectedEmployee === null
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    Cualquiera
                  </button>
                  {employees.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => setSelectedEmployee(emp.id)}
                      className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${
                        selectedEmployee === emp.id
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {emp.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedEmployee != null && (
              <div className="mb-6 p-3 rounded-xl border text-sm" style={{ borderColor: custom?.card_border_color || "#e5e7eb", backgroundColor: `${primaryColor}08`, color: custom?.text_color || "#374151" }}>
                <span className="font-semibold" style={{ color: custom?.service_title_color || "#111827" }}>
                  Horario de {employees.find((e) => e.id === selectedEmployee)?.name ?? "empleado"}:
                </span>{" "}
                {employeeSchedule === null ? (
                  <span className="opacity-70">Cargando…</span>
                ) : employeeSchedule.length === 0 ? (
                  <span className="opacity-70">Sin horarios configurados</span>
                ) : (
                  <span>
                    {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((dayName, dayOfWeek) => {
                      const slots = employeeSchedule.filter((s) => s.day_of_week === dayOfWeek);
                      if (slots.length === 0) return null;
                      return (
                        <span key={dayOfWeek} className="inline-block mr-3 mt-1">
                          {dayName} {slots.map((s) => `${s.start_time}–${s.end_time}`).join(", ")}
                        </span>
                      );
                    })}
                  </span>
                )}
              </div>
            )}

            <h2 className="text-xl font-bold mb-4" style={{ color: custom?.service_title_color || "#111827" }}>
              Selecciona la fecha
            </h2>

            {isLoadingDates ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: custom?.primary_color || "#3b82f6" }} />
              </div>
            ) : availableDates.length === 0 ? (
              <div className="text-center py-12 bg-yellow-50 border border-yellow-200 rounded-xl">
                <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-3" />
                <p className="text-slate-700 font-medium">
                  No hay fechas disponibles para este servicio
                  {selectedEmployee != null && " con el empleado elegido"}
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  {selectedEmployee != null
                    ? "Este empleado puede no tener horarios configurados, o no hay huecos en los próximos 30 días. Prueba con «Cualquiera» u otro empleado."
                    : "Por favor, selecciona otro servicio"}
                </p>
              </div>
            ) : (
              <>
                {/* Calendar Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold" style={{ color: custom?.service_title_color || "#111827" }}>
                    {currentMonth.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
                  </h3>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        const prevMonth = new Date(currentMonth);
                        prevMonth.setMonth(prevMonth.getMonth() - 1);
                        setCurrentMonth(prevMonth);
                      }}
                      className="p-1 rounded transition-colors"
                      style={{
                        color: custom?.text_color || "#6b7280",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${primaryColor}15`;
                        e.currentTarget.style.color = primaryColor;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = custom?.text_color || "#6b7280";
                      }}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        const nextMonth = new Date(currentMonth);
                        nextMonth.setMonth(nextMonth.getMonth() + 1);
                        setCurrentMonth(nextMonth);
                      }}
                      className="p-1 rounded transition-colors"
                      style={{
                        color: custom?.text_color || "#6b7280",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${primaryColor}15`;
                        e.currentTarget.style.color = primaryColor;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = custom?.text_color || "#6b7280";
                      }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"].map((day) => (
                    <div key={day} className="text-center text-xs font-semibold py-1" style={{ color: custom?.time_text_color || "#6b7280" }}>
                      {day}
                    </div>
                  ))}
                </div>
                
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const today = new Date();
                    const year = currentMonth.getFullYear();
                    const month = currentMonth.getMonth();
                    
                    // First day of the month
                    const firstDay = new Date(year, month, 1);
                    const firstDayOfWeek = firstDay.getDay(); // 0 = domingo
                    
                    // Last day of the month
                    const lastDay = new Date(year, month + 1, 0);
                    const daysInMonth = lastDay.getDate();
                    
                    const calendarCells: (string | null)[] = [];
                    
                    // Add previous month's trailing days
                    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
                      calendarCells.push(null); // These will be empty cells
                    }
                    
                    // Add current month's days - show all dates but disable past dates and dates beyond 30 days
                    for (let day = 1; day <= daysInMonth; day++) {
                      const date = new Date(year, month, day);
                      const dateStr = date.toISOString().split("T")[0];
                      calendarCells.push(dateStr);
                    }
                    
                    // Fill remaining cells to complete the grid (next month's days)
                    while (calendarCells.length % 7 !== 0) {
                      calendarCells.push(null);
                    }
                    
                    return calendarCells.map((date, index) => {
                      if (!date) {
                        // Empty cell for alignment or unavailable dates
                        return <div key={`empty-${index}`} className="aspect-square" />;
                      }
                      
                const dateObj = new Date(date + "T00:00:00");
                      const daysFromToday = Math.floor((dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                      const isPastDate = daysFromToday < 0;
                      const isBeyond30Days = daysFromToday >= 30;
                      const hasAvailableSlotsForDate = hasAvailableSlots(date);
                      const isAvailable = !isPastDate && !isBeyond30Days && hasAvailableSlotsForDate;
                      const isSelected = date === selectedDate;
                      const isToday = date === today.toISOString().split("T")[0];
                      
                const primaryColor = custom?.primary_color || "#3b82f6";
                const textColor = custom?.text_color || "#374151";
                const backgroundColor = custom?.background_color || "#ffffff";
                
                // Detectar si es modo oscuro (background oscuro)
                const isDarkMode = backgroundColor && (
                  backgroundColor.toLowerCase().includes("#0") || 
                  backgroundColor.toLowerCase().includes("#1") ||
                  backgroundColor.toLowerCase().includes("#2") ||
                  parseInt(backgroundColor.replace("#", ""), 16) < parseInt("333333", 16)
                );
                
                const isSelectedStyle = isSelected ? { 
                  backgroundColor: primaryColor, 
                  color: "#ffffff", 
                  border: "none" 
                } : {};
                
                // Para "hoy": solo borde, sin fondo, y el texto usa el color de texto normal
                const isTodayStyle = isToday && !isSelected ? { 
                  border: `2px solid ${primaryColor}`, 
                  backgroundColor: "transparent",
                  color: textColor 
                } : {};
                
                // Para fechas disponibles: usar el color de texto con contraste adecuado
                const defaultStyle = !isSelected && !isToday && isAvailable ? { 
                  color: textColor,
                  border: "none",
                  backgroundColor: "transparent"
                } : {};
                
                // Estilos para fechas deshabilitadas
                const disabledStyle = !isAvailable ? (isDarkMode ? {
                  color: "#9ca3af",
                  backgroundColor: "rgba(156, 163, 175, 0.1)",
                  border: "none"
                } : {
                  color: "#d1d5db",
                  backgroundColor: "#f3f4f6",
                  border: "none"
                }) : {};
                
                return (
                  <button
                    key={date}
                          onClick={() => isAvailable && setSelectedDate(date)}
                          disabled={!isAvailable}
                          className={`aspect-square flex items-center justify-center text-sm font-medium transition-all rounded-full ${
                            isAvailable
                              ? "hover:opacity-80 cursor-pointer"
                              : "opacity-60 cursor-not-allowed line-through"
                          }`}
                          style={{
                            ...isSelectedStyle,
                            ...isTodayStyle,
                            ...defaultStyle,
                            ...disabledStyle,
                          }}
                        >
                      {dateObj.getDate()}
                  </button>
                );
                    });
                  })()}
            </div>
                {availableDates.length < 30 && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-sm text-blue-800">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      Solo se muestran las fechas con horarios disponibles
                    </p>
            </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Time slots (sigue siendo Paso 2) */}
        {selectedService && selectedDate && !selectedTime && (
          <div 
            className="rounded-2xl shadow-xl p-6"
            style={{
              backgroundColor: custom?.card_background_color || "#ffffff",
              borderColor: custom?.card_border_color || "#e5e7eb",
              borderWidth: "1px",
              borderStyle: "solid",
            }}
          >
            <button
              onClick={() => setSelectedDate("")}
              className="flex items-center space-x-2 mb-4 transition-colors"
              style={{ 
                color: custom?.text_color || "#6b7280",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = primaryColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = custom?.text_color || "#6b7280";
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Cambiar fecha</span>
            </button>

            <h2 className="text-xl font-bold mb-4" style={{ color: custom?.service_title_color || "#111827" }}>
              Selecciona la hora
            </h2>

            {isLoadingSlots ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: custom?.primary_color || "#3b82f6" }} />
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="text-center py-12 bg-yellow-50 border border-yellow-200 rounded-xl">
                <Calendar className="w-12 h-12 text-yellow-600 mx-auto mb-3" />
                <p className="text-slate-700 font-medium mb-1">
                  No hay horarios disponibles para esta fecha
                </p>
                <p className="text-sm text-slate-600">
                  Por favor, selecciona otra fecha
                </p>
              </div>
            ) : (
              <>
                {/* Paginación de slots: 16 por página (4x4) */}
                {(() => {
                  const SLOTS_PER_PAGE = 16; // 4 filas x 4 columnas
                  const totalPages = Math.ceil(availableSlots.length / SLOTS_PER_PAGE);
                  const startIndex = currentTimePage * SLOTS_PER_PAGE;
                  const endIndex = startIndex + SLOTS_PER_PAGE;
                  const currentSlots = availableSlots.slice(startIndex, endIndex);
                  const primaryColor = custom?.primary_color || "#3b82f6";

                  return (
                    <>
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        {currentSlots.map((time) => {
                          const isSelected = time === selectedTime;
                          return (
                  <button
                    key={time}
                    onClick={() => setSelectedTime(time)}
                              className="p-3 rounded-xl border-2 transition-all text-center font-semibold"
                              style={{
                                borderColor: isSelected ? primaryColor : (custom?.card_border_color || "#e5e7eb"),
                                backgroundColor: isSelected ? `${primaryColor}15` : "transparent",
                                color: isSelected ? primaryColor : (custom?.text_color || "#111827"),
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.borderColor = primaryColor;
                                  e.currentTarget.style.backgroundColor = `${primaryColor}10`;
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.borderColor = custom?.card_border_color || "#e5e7eb";
                                  e.currentTarget.style.backgroundColor = "transparent";
                                }
                              }}
                  >
                    {time}
                  </button>
                          );
                        })}
                      </div>

                      {/* Navegación de páginas */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: custom?.card_border_color || "#e5e7eb" }}>
                          <button
                            onClick={() => setCurrentTimePage(Math.max(0, currentTimePage - 1))}
                            disabled={currentTimePage === 0}
                            className="flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              borderColor: currentTimePage === 0 ? (custom?.card_border_color || "#e5e7eb") : primaryColor,
                              color: currentTimePage === 0 ? (custom?.text_color || "#6b7280") : primaryColor,
                            }}
                          >
                            <ChevronLeft className="w-4 h-4" />
                            <span>Ant</span>
                          </button>

                          <span className="text-sm" style={{ color: custom?.text_color || "#6b7280" }}>
                            pag {currentTimePage + 1} de {totalPages}
                          </span>

                          <button
                            onClick={() => setCurrentTimePage(Math.min(totalPages - 1, currentTimePage + 1))}
                            disabled={currentTimePage === totalPages - 1}
                            className="flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              borderColor: currentTimePage === totalPages - 1 ? (custom?.card_border_color || "#e5e7eb") : primaryColor,
                              color: currentTimePage === totalPages - 1 ? (custom?.text_color || "#6b7280") : primaryColor,
                            }}
                          >
                            <span>Sig</span>
                            <ChevronRight className="w-4 h-4" />
                          </button>
              </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Step 3: Customer Information */}
        {selectedService && selectedDate && selectedTime && (
          <div 
            className="rounded-2xl shadow-xl p-6"
            style={{
              backgroundColor: custom?.card_background_color || "#ffffff",
              borderColor: custom?.card_border_color || "#e5e7eb",
              borderWidth: "1px",
              borderStyle: "solid",
            }}
          >
            <h2 className="text-xl font-bold mb-1" style={{ color: custom?.service_title_color || "#111827" }}>
              Paso 3 de 4: Tus datos
            </h2>
            <p className="text-sm mb-4" style={{ color: custom?.text_color || "#6b7280" }}>
              Datos de contacto para confirmar tu cita
            </p>
            <button
              onClick={() => setSelectedTime("")}
              className="flex items-center space-x-2 mb-4 transition-colors"
              style={{ 
                color: custom?.text_color || "#6b7280",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = primaryColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = custom?.text_color || "#6b7280";
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Cambiar hora</span>
            </button>

            <h3 className="text-lg font-bold mb-4" style={{ color: custom?.service_title_color || "#111827" }}>
              Completa tus datos
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Estilos dinámicos para placeholders y selects */}
              <style>{`
                input::placeholder,
                textarea::placeholder {
                  color: ${custom?.text_color ? `${custom.text_color}99` : "#6b7280"} !important;
                  opacity: 0.7 !important;
                }
                select option {
                  background-color: ${custom?.card_background_color || "#ffffff"} !important;
                  color: ${custom?.text_color || "#111827"} !important;
                }
              `}</style>
              <div>
                <label 
                  className="block text-sm font-semibold mb-2"
                  style={{ color: custom?.text_color || "#374151" }}
                >
                  Nombre completo *
                </label>
                <input
                  type="text"
                  required
                  value={formData.customer_name}
                  onChange={(e) =>
                    setFormData({ ...formData, customer_name: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border outline-none transition-all"
                  style={{
                    borderColor: custom?.card_border_color || "#d1d5db",
                    backgroundColor: custom?.card_background_color || "#ffffff",
                    color: custom?.text_color || "#111827",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}20`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = custom?.card_border_color || "#d1d5db";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  placeholder="Juan Pérez"
                />
              </div>

              <div>
                <label 
                  className="block text-sm font-semibold mb-2"
                  style={{ color: custom?.text_color || "#374151" }}
                >
                  Teléfono / WhatsApp *
                </label>
                <input
                  type="tel"
                  required
                  value={formData.customer_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, customer_phone: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border outline-none transition-all"
                  style={{
                    borderColor: custom?.card_border_color || "#d1d5db",
                    backgroundColor: custom?.card_background_color || "#ffffff",
                    color: custom?.text_color || "#111827",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}20`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = custom?.card_border_color || "#d1d5db";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  placeholder="+52 55 1234 5678"
                />
              </div>

              <div>
                <label 
                  className="block text-sm font-semibold mb-2"
                  style={{ color: custom?.text_color || "#374151" }}
                >
                  Email (opcional)
                </label>
                <input
                  type="email"
                  value={formData.customer_email}
                  onChange={(e) =>
                    setFormData({ ...formData, customer_email: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border outline-none transition-all"
                  style={{
                    borderColor: custom?.card_border_color || "#d1d5db",
                    backgroundColor: custom?.card_background_color || "#ffffff",
                    color: custom?.text_color || "#111827",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}20`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = custom?.card_border_color || "#d1d5db";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  placeholder="correo@ejemplo.com"
                />
              </div>

              {/* Payment Method Selection */}
              {paymentMethods.length > 0 && (
                <div>
                  <label 
                    className="block text-sm font-semibold mb-2"
                    style={{ color: custom?.text_color || "#374151" }}
                  >
                    Método de pago *
                  </label>
                  <select
                    required
                    value={selectedPaymentMethod?.id || ""}
                    onChange={(e) => {
                      const methodId = e.target.value;
                      if (methodId === "") {
                        setSelectedPaymentMethod(null);
                      } else {
                        const method = paymentMethods.find(
                          (m) => m.id === parseInt(methodId)
                        );
                        setSelectedPaymentMethod(method || null);
                      }
                    }}
                    className="w-full px-4 py-3 rounded-xl border outline-none transition-all"
                    style={{
                      borderColor: custom?.card_border_color || "#d1d5db",
                      backgroundColor: custom?.card_background_color || "#ffffff",
                      color: custom?.text_color || "#111827",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = primaryColor;
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}20`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = custom?.card_border_color || "#d1d5db";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <option value="">-- Selecciona un método de pago --</option>
                    {paymentMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.method_type === "transfer" && "Transferencia Bancaria"}
                        {method.method_type === "cash" && "Efectivo"}
                        {method.method_type === "card" && "Tarjeta de Crédito/Débito"}
                        {!["transfer", "cash", "card"].includes(method.method_type) && method.method_type}
                      </option>
                    ))}
                  </select>

                  {/* Payment Method Specific Messages */}
                  {selectedPaymentMethod?.method_type === "transfer" && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <h4 className="font-semibold text-blue-900 mb-3">Datos para Transferencia Bancaria</h4>
                      <div className="space-y-2 text-sm text-blue-800">
                        {selectedPaymentMethod.account_holder_name && (
                          <div>
                            <span className="font-semibold">Titular:</span>{" "}
                            {selectedPaymentMethod.account_holder_name}
                          </div>
                        )}
                        {selectedPaymentMethod.account_number && (
                          <div>
                            <span className="font-semibold">Número de cuenta:</span>{" "}
                            {selectedPaymentMethod.account_number}
                          </div>
                        )}
                        {selectedPaymentMethod.clabe && (
                          <div>
                            <span className="font-semibold">CLABE:</span>{" "}
                            {selectedPaymentMethod.clabe}
                          </div>
                        )}
                        {selectedPaymentMethod.card_number && (
                          <div>
                            <span className="font-semibold">Tarjeta:</span>{" "}
                            {selectedPaymentMethod.card_number}
                          </div>
                        )}
                      </div>
                      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800 flex items-start">
                          <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                          <span>
                            <strong>Importante:</strong> Para confirmar tu reserva, por favor envía el comprobante de pago al número de WhatsApp del negocio. Tu cita quedará pendiente hasta recibir la confirmación del pago.
                          </span>
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedPaymentMethod?.method_type === "cash" && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                      <div className="flex items-start space-x-3">
                        <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-green-900 mb-2">Pago en Efectivo</h4>
                          <p className="text-sm text-green-800">
                            El pago se realizará directamente al momento de tu cita. Tu reserva ha sido confirmada y te esperamos en la fecha y hora seleccionadas.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedPaymentMethod?.method_type === "card" && (
                    <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                      <div className="flex items-start space-x-3">
                        <AlertCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-purple-900 mb-2">Pago con Tarjeta</h4>
                          <p className="text-sm text-purple-800">
                            El pago se realizará en el establecimiento al momento de tu cita usando tu tarjeta de crédito o débito. Tu reserva ha sido confirmada.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label 
                  className="block text-sm font-semibold mb-2"
                  style={{ color: custom?.text_color || "#374151" }}
                >
                  Notas adicionales (opcional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border outline-none transition-all resize-none"
                  style={{
                    borderColor: custom?.card_border_color || "#d1d5db",
                    backgroundColor: custom?.card_background_color || "#ffffff",
                    color: custom?.text_color || "#111827",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}20`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = custom?.card_border_color || "#d1d5db";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  placeholder="Alguna preferencia o comentario..."
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-4 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                style={{
                  background: custom ? `linear-gradient(135deg, ${custom.primary_color || "#3b82f6"} 0%, ${custom.secondary_color || "#8b5cf6"} 100%)` : "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
                  boxShadow: custom ? `0 10px 15px -3px ${custom.primary_color || "#3b82f6"}30, 0 4px 6px -2px ${custom.primary_color || "#3b82f6"}20` : undefined,
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Procesando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>Confirmar Reserva</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Plus, Calendar, Settings, Share2, Briefcase, ExternalLink, ArrowRight } from "lucide-react";
import type { Tenant } from "@/shared/types";
import { useAuth } from "@/react-app/contexts/AuthContext";

export default function DashboardPage() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [servicesCount, setServicesCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (tenants.length > 0) {
      fetchServicesCount(tenants[0].id);
    } else {
      setServicesCount(null);
    }
  }, [tenants]);

  const fetchTenants = async () => {
    try {
      const response = await fetch("/api/tenants");
      if (response.ok) {
        const data = await response.json();
        setTenants(data);
      }
    } catch (error) {
      console.error("Error al cargar negocios:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchServicesCount = async (tenantId: number) => {
    try {
      const response = await fetch(`/api/services?tenant_id=${tenantId}`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setServicesCount(Array.isArray(data) ? data.length : 0);
      } else {
        setServicesCount(0);
      }
    } catch {
      setServicesCount(0);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  // Welcome State (No Tenants)
  if (tenants.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12 animate-fade-in-up">
        <div className="bg-white rounded-3xl shadow-2xl shadow-indigo-500/10 border border-slate-100 p-12 text-center overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

          <div className="w-24 h-24 mx-auto mb-8 rounded-3xl bg-indigo-50 flex items-center justify-center shadow-inner">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3">
              <Calendar className="w-8 h-8 text-white" />
            </div>
          </div>

          <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">
            Bienvenido a ReservaApp
          </h2>
          <p className="text-lg text-slate-500 mb-10 max-w-md mx-auto leading-relaxed">
            Tu plataforma profesional para gestionar citas. Crea tu primer negocio para comenzar a recibir reservas hoy mismo.
          </p>

          <Link
            to="/dashboard/settings"
            className="inline-flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl shadow-slate-900/20 hover:scale-[1.02] hover:bg-slate-800 transition-all duration-300"
          >
            <Plus className="w-5 h-5" />
            <span>Crear mi primer negocio</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fade-in-up pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Panel de Control</h2>
          <p className="text-slate-500 mt-2 text-lg">
            Bienvenido, {user?.email || 'Administrador'}
          </p>
        </div>
        {/* "Nuevo Negocio" removed as per single-tenant policy */}
      </div>

      {/* Onboarding Guide */}
      {tenants.length > 0 && servicesCount === 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 md:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Briefcase className="w-32 h-32 text-amber-600" />
          </div>

          <h3 className="text-xl font-bold text-amber-900 mb-4 flex items-center gap-3 relative z-10">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Briefcase className="w-5 h-5 text-amber-700" />
            </div>
            Configuración Inicial
          </h3>
          <p className="text-amber-800/80 mb-6 max-w-xl relative z-10">
            Para que tus clientes puedan reservar, necesitas completar estos pasos esenciales:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
            <Link to="/dashboard/services" className="group bg-white p-4 rounded-2xl border border-amber-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all flex items-center gap-4">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold group-hover:bg-amber-600 group-hover:text-white transition-colors">1</span>
              <div>
                <span className="block font-bold text-amber-900">Añade Servicios</span>
                <span className="text-xs text-amber-700/60">Define qué ofreces</span>
              </div>
              <ArrowRight className="w-4 h-4 text-amber-300 ml-auto group-hover:text-amber-600" />
            </Link>

            <Link to="/dashboard/schedules" className="group bg-white p-4 rounded-2xl border border-amber-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all flex items-center gap-4">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold group-hover:bg-amber-600 group-hover:text-white transition-colors">2</span>
              <div>
                <span className="block font-bold text-amber-900">Define Horarios</span>
                <span className="text-xs text-amber-700/60">¿Cuándo trabajas?</span>
              </div>
              <ArrowRight className="w-4 h-4 text-amber-300 ml-auto group-hover:text-amber-600" />
            </Link>

            <div className="group bg-white/60 p-4 rounded-2xl border border-amber-100 border-dashed flex items-center gap-4 opacity-70">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-400 font-bold">3</span>
              <div>
                <span className="block font-bold text-slate-500">Comparte tu Link</span>
                <span className="text-xs text-slate-400">Al finalizar</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Stats & Business Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Quick Actions & Stats */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-3xl shadow-xl shadow-slate-900/10 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
              <Calendar className="w-24 h-24" />
            </div>

            <div className="relative z-10">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Gestión de Citas</p>
              <h3 className="text-xl font-bold mt-2 mb-4">Calendario y Reservas</h3>
              <Link to="/dashboard/appointments" className="inline-flex items-center gap-2 text-sm font-bold text-white bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl transition-colors backdrop-blur-sm">
                Ver Citas <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h4 className="font-bold text-slate-900 mb-4">Accesos Directos</h4>
            <nav className="space-y-2">
              <Link to="/dashboard/services" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-600 hover:text-indigo-600 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <ArrowRight className="w-4 h-4" />
                </div>
                <span className="font-medium">Gestionar Servicios</span>
              </Link>
              <Link to="/dashboard/schedules" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-600 hover:text-indigo-600 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <ArrowRight className="w-4 h-4" />
                </div>
                <span className="font-medium">Configurar Horarios</span>
              </Link>
            </nav>
          </div>
        </div>

        {/* Right Column: Business Card (Spans 2 cols) */}
        <div className="lg:col-span-2">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Tu Negocio</h3>
              {tenants[0]?.is_active && (
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  Online
                </span>
              )}
            </div>

            {tenants.map((tenant) => (
              <div
                key={tenant.id}
                className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex flex-col md:flex-row"
              >
                <div className="p-8 flex-1">
                  <div className="flex items-center gap-6 mb-6">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-3xl shadow-lg shadow-indigo-500/30">
                      {tenant.slug[0].toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900">
                        {tenant.slug}
                      </h3>
                      <a href={`/${tenant.slug}`} target="_blank" className="flex items-center gap-1 text-slate-400 font-medium mt-1 hover:text-indigo-600 transition-colors">
                        citame.click/{tenant.slug} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Link
                      to={`/dashboard/settings`}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-all"
                    >
                      <Settings className="w-4 h-4" /> Configuración General
                    </Link>
                    <Link
                      to={`/dashboard/social`}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-all"
                    >
                      <Share2 className="w-4 h-4" /> Redes Sociales
                    </Link>
                  </div>
                </div>

                <div className="bg-slate-50 p-8 flex flex-col justify-center border-t md:border-t-0 md:border-l border-slate-100 min-w-[240px]">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Vista Pública</p>
                  <Link
                    to={`/${tenant.slug}`}
                    target="_blank"
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] transition-all"
                  >
                    <ExternalLink className="w-5 h-5" /> Ver Página
                  </Link>
                  <p className="text-center text-xs text-slate-400 mt-4">
                    Así ven tu negocio tus clientes
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

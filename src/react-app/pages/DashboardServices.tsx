import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Clock, DollarSign, Users, Search, Package } from "lucide-react";
import ServiceModal from "@/react-app/components/ServiceModal";
import type { Service, Tenant } from "@/shared/types";

export default function DashboardServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      fetchServices();
    }
  }, [selectedTenant]);

  const fetchTenants = async () => {
    try {
      const response = await fetch("/api/tenants");
      if (response.ok) {
        const data = await response.json();
        setTenants(data);
        if (data.length > 0) {
          setSelectedTenant(data[0].id);
        }
      }
    } catch (error) {
      console.error("Error al cargar negocios:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchServices = async (): Promise<Service[] | void> => {
    if (!selectedTenant) return;

    try {
      const response = await fetch(
        `/api/services?tenant_id=${selectedTenant}`,
        { credentials: "include" }
      );
      if (response.ok) {
        const data = await response.json();
        setServices(data);
        return data;
      }
    } catch (error) {
      console.error("Error al cargar servicios:", error);
    }
  };

  const handleCreateService = async (serviceData: Partial<Service>): Promise<Service | void> => {
    const response = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serviceData),
    });

    if (!response.ok) {
      throw new Error("Error al crear servicio");
    }

    const created = (await response.json()) as Service;
    await fetchServices();
    return created;
  };

  const handleUpdateService = async (serviceData: Partial<Service>) => {
    if (!editingService) return;

    const response = await fetch(`/api/services/${editingService.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serviceData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Error desconocido" }));
      const errorMessage = errorData.details
        ? `Error de validación: ${errorData.details.map((d: any) => d.message).join(", ")}`
        : errorData.error || "Error al actualizar servicio";
      throw new Error(errorMessage);
    }

    await fetchServices();
    setEditingService(null);
  };

  const handleDeleteService = async (serviceId: number) => {
    if (!confirm("¿Estás seguro de eliminar este servicio?")) {
      return;
    }

    try {
      const response = await fetch(`/api/services/${serviceId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchServices();
      }
    } catch (error) {
      console.error("Error al eliminar servicio:", error);
      alert("Error al eliminar el servicio");
    }
  };

  const openCreateModal = () => {
    setEditingService(null);
    setIsModalOpen(true);
  };

  const openEditModal = (service: Service) => {
    setEditingService(service);
    setIsModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  // No Tenants State
  if (tenants.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-12 animate-fade-in-up">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-12 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Package className="w-10 h-10 text-slate-300" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">No tienes negocios configurados</h2>
          <p className="text-slate-500 mb-8 max-w-sm mx-auto">
            Necesitas tener un negocio activo para poder agregar y gestionar servicios.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in-up pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Servicios</h2>
          <p className="text-slate-500 mt-1 text-lg">
            Catálogo de servicios disponibles para reserva
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tenants.length > 1 && (
            <div className="relative">
              <select
                value={selectedTenant || ""}
                onChange={(e) => setSelectedTenant(parseInt(e.target.value))}
                className="appearance-none pl-4 pr-10 py-3 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer shadow-sm hover:border-slate-300"
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.slug}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={openCreateModal}
            className="inline-flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 hover:scale-[1.02] transition-all duration-200"
          >
            <Plus className="w-5 h-5" />
            <span>Nuevo Servicio</span>
          </button>
        </div>
      </div>

      {/* Empty State for Services */}
      {services.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-md border border-dashed border-slate-300 p-16 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-indigo-50 flex items-center justify-center shadow-inner">
            <div className="w-12 h-12 bg-indigo-600/10 rounded-xl flex items-center justify-center">
              <Plus className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            No hay servicios creados
          </h3>
          <p className="text-slate-500 mb-8 max-w-sm mx-auto text-lg">
            Tus clientes verán los servicios aquí una vez que los crees.
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center space-x-2 px-8 py-4 bg-white border-2 border-indigo-600 text-indigo-700 rounded-2xl font-bold hover:bg-indigo-50 transition-all duration-200"
          >
            <Plus className="w-5 h-5" />
            <span>Crear Primer Servicio</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <div
              key={service.id}
              className="bg-white rounded-3xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-200 hover:shadow-xl hover:shadow-indigo-500/5 hover:border-indigo-100 transition-all duration-300 group flex flex-col overflow-hidden"
            >
              <div className="p-6 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 pr-4">
                    <h3 className="text-xl font-bold text-slate-900 leading-tight mb-2 group-hover:text-indigo-700 transition-colors">
                      {service.title}
                    </h3>
                    {service.description && (
                      <p className="text-slate-500 text-sm line-clamp-2 leading-relaxed">
                        {service.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap uppercase tracking-wide border ${service.is_active
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                        : "bg-slate-50 text-slate-500 border-slate-100"
                      }`}
                  >
                    {service.is_active ? "Activo" : "Inactivo"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {service.price !== undefined && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-sm font-semibold text-slate-700">
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                      ${service.price.toFixed(2)}
                    </div>
                  )}

                  {service.duration_minutes && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-sm font-medium text-slate-600">
                      <Clock className="w-4 h-4 text-slate-400" />
                      {service.duration_minutes} min
                    </div>
                  )}

                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-sm font-medium text-slate-600">
                    <Users className="w-4 h-4 text-slate-400" />
                    {service.max_simultaneous_bookings} cupo{service.max_simultaneous_bookings !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-3">
                <button
                  onClick={() => openEditModal(service)}
                  className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all text-sm"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Editar</span>
                </button>
                <button
                  onClick={() => handleDeleteService(service.id)}
                  className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all text-sm group/delete"
                >
                  <Trash2 className="w-4 h-4 group-hover/delete:scale-110 transition-transform" />
                  <span>Eliminar</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal - Passing props cleanly */}
      {selectedTenant && (
        <ServiceModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingService(null);
          }}
          onSave={editingService ? handleUpdateService : handleCreateService}
          service={editingService}
          tenantId={selectedTenant}
          onVariantChange={async () => {
            // Hot reload for variants if needed
            const list = await fetchServices();
            if (list && editingService) {
              const updated = list.find((s) => s.id === editingService.id);
              if (updated) setEditingService(updated);
            }
          }}
        />
      )}
    </div>
  );
}

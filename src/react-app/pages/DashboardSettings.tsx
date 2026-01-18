import { useState, useEffect, useRef } from "react";
import {
  Save,
  Building2,
  MapPin,
  Phone,
  MessageCircle,
  Map,
  AlertCircle,
  CheckCircle,
  Loader2,
  Upload,
  Image as ImageIcon,
  X,
  Settings,
  Share2,
  CreditCard,
  Palette,
} from "lucide-react";
import type { Tenant, BusinessConfig } from "@/shared/types";
import DashboardSocialPage from "./DashboardSocial";
import DashboardPaymentsPage from "./DashboardPayments";
import DashboardCustomizePage from "./DashboardCustomize";

type TabType = "config" | "social" | "payments" | "customize";

export default function DashboardSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("config");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "success" | "error"
  >("idle");

  const [formData, setFormData] = useState({
    business_name: "",
    address: "",
    phone: "",
    whatsapp: "",
    google_maps_url: "",
    profile_image_url: "",
    header_image_url: "",
  });

  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [isCreatingTenant, setIsCreatingTenant] = useState(false);
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const profileInputRef = useRef<HTMLInputElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      fetchConfig();
    }
  }, [selectedTenant]);

  useEffect(() => {
    if (config) {
      setFormData({
        business_name: config.business_name || "",
        address: config.address || "",
        phone: config.phone || "",
        whatsapp: config.whatsapp || "",
        google_maps_url: config.google_maps_url || "",
        profile_image_url: config.profile_image_url || "",
        header_image_url: config.header_image_url || "",
      });
    }
  }, [config]);

  const fetchTenants = async () => {
    try {
      const response = await fetch("/api/tenants");
      if (response.ok) {
        const data = await response.json();
        setTenants(data);
        if (data.length > 0) {
          setSelectedTenant(data[0]);
        }
      }
    } catch (error) {
      console.error("Error al cargar negocios:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchConfig = async () => {
    if (!selectedTenant) return;

    try {
      const response = await fetch(
        `/api/tenants/${selectedTenant.slug}/config`
      );
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        console.log("Config cargada:", data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Error al cargar configuración:", errorData);
      }
    } catch (error) {
      console.error("Error al cargar configuración:", error);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingTenant(true);

    try {
      const response = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newTenantSlug }),
      });

      if (response.ok) {
        const newTenant = await response.json();
        setTenants([...tenants, newTenant]);
        setSelectedTenant(newTenant);
        setNewTenantSlug("");
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        const error = await response.json();
        alert(error.error || "Error al crear negocio");
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch (error) {
      console.error("Error al crear negocio:", error);
      alert("Error al crear negocio");
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setIsCreatingTenant(false);
    }
  };

  // Función para comprimir imagen usando Canvas API
  const compressImage = async (file: File, maxWidth: number, maxHeight: number, quality: number = 0.85): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          // Calcular nuevas dimensiones manteniendo aspecto
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("No se pudo obtener contexto del canvas"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Error al comprimir imagen"));
              }
            },
            "image/jpeg",
            quality
          );
        };
        img.onerror = () => reject(new Error("Error al cargar imagen"));
      };
      reader.onerror = () => reject(new Error("Error al leer archivo"));
    });
  };

  const handleImageUpload = async (file: File, type: "profile" | "header") => {
    if (!selectedTenant) {
      alert("Por favor selecciona un negocio primero");
      return;
    }

    // Validar tamaño (máx 10MB antes de comprimir)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      alert("El archivo es demasiado grande. Máximo 10MB");
      return;
    }

    if (type === "profile") {
      setUploadingProfile(true);
    } else {
      setUploadingHeader(true);
    }

    try {
      // Comprimir imagen según el tipo
      const maxWidth = type === "profile" ? 400 : 1920;
      const maxHeight = type === "profile" ? 400 : 600;
      
      const compressedBlob = await compressImage(file, maxWidth, maxHeight, 0.85);
      const compressedFile = new File([compressedBlob], file.name, { type: "image/jpeg" });

      console.log(`Imagen ${type} comprimida: ${file.size} bytes -> ${compressedBlob.size} bytes (${Math.round((1 - compressedBlob.size / file.size) * 100)}% reducción)`);

      const formDataToUpload = new FormData();
      formDataToUpload.append("file", compressedFile);

      // Step 1: Upload image to R2
      const uploadResponse = await fetch("/api/upload/image", {
        method: "POST",
        body: formDataToUpload,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(errorData.error || "Error al subir la imagen");
      }

      const uploadData = await uploadResponse.json();
      const imageUrl = uploadData.url;

      console.log(`Imagen ${type} subida correctamente:`, imageUrl);

      // Step 2: Save image URL to database
      const configUpdate: any = {};
      configUpdate[type === "profile" ? "profile_image_url" : "header_image_url"] = imageUrl;

      const saveResponse = await fetch(`/api/tenants/${selectedTenant.slug}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configUpdate),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json().catch(() => ({ error: "Error al guardar" }));
        throw new Error(errorData.error || "Error al guardar la URL de la imagen");
      }

      const savedConfig = await saveResponse.json();
      console.log(`Config guardada correctamente:`, savedConfig);

      // Step 3: Update local state
      setFormData((prev) => ({
        ...prev,
        [type === "profile" ? "profile_image_url" : "header_image_url"]: imageUrl,
      }));

      // Step 4: Refresh config from server
      await fetchConfig();

      // Show success message
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (error: any) {
      console.error(`Error al subir imagen ${type}:`, error);
      alert(error.message || `Error al subir la imagen ${type}`);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      if (type === "profile") {
        setUploadingProfile(false);
      } else {
        setUploadingHeader(false);
      }
    }
  };

  const handleRemoveImage = async (type: "profile" | "header") => {
    if (!selectedTenant) return;

    const configUpdate: any = {};
    configUpdate[type === "profile" ? "profile_image_url" : "header_image_url"] = null;

    try {
      const response = await fetch(`/api/tenants/${selectedTenant.slug}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configUpdate),
      });

      if (response.ok) {
        if (type === "profile") {
          setFormData({ ...formData, profile_image_url: "" });
        } else {
          setFormData({ ...formData, header_image_url: "" });
        }
        await fetchConfig();
      }
    } catch (error) {
      console.error("Error al eliminar imagen:", error);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;

    setIsSaving(true);
    setSaveStatus("idle");

    try {
      const response = await fetch(
        `/api/tenants/${selectedTenant.slug}/config`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );

      if (response.ok) {
        const updated = await response.json();
        setConfig(updated);
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch (error) {
      console.error("Error al guardar:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200/60 p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              Crea tu primer negocio
            </h2>
            <p className="text-slate-600">
              Comienza configurando la URL de tu página de reservas
            </p>
          </div>

          <form onSubmit={handleCreateTenant} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                URL de tu negocio
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-slate-500 font-medium">
                  reservaapp.com/
                </span>
                <input
                  type="text"
                  required
                  pattern="[a-z0-9-]+"
                  value={newTenantSlug}
                  onChange={(e) =>
                    setNewTenantSlug(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                    )
                  }
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  placeholder="mi-negocio"
                />
              </div>
              <p className="text-sm text-slate-500 mt-2">
                Solo letras minúsculas, números y guiones
              </p>
            </div>

            <button
              type="submit"
              disabled={isCreatingTenant || !newTenantSlug}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isCreatingTenant ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Creando...</span>
                </>
              ) : (
                <>
                  <Building2 className="w-5 h-5" />
                  <span>Crear Negocio</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "config" as TabType, label: "Configuración", icon: Settings },
    { id: "social" as TabType, label: "Redes Sociales", icon: Share2 },
    { id: "payments" as TabType, label: "Pagos", icon: CreditCard },
    { id: "customize" as TabType, label: "Personalización", icon: Palette },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Configuración</h2>
          <p className="text-slate-600 mt-1">
            Gestiona toda la configuración de tu negocio
          </p>
        </div>

        {tenants.length > 1 && activeTab === "config" && (
          <select
            value={selectedTenant?.id || ""}
            onChange={(e) => {
              const tenant = tenants.find(
                (t) => t.id === parseInt(e.target.value)
              );
              setSelectedTenant(tenant || null);
            }}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                /{tenant.slug}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200/60 overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-6 py-4 font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeTab === "config" && (
            <>
          {/* Save status */}
          {saveStatus !== "idle" && (
            <div
              className={`rounded-xl p-4 flex items-center space-x-3 ${
                saveStatus === "success"
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              {saveStatus === "success" ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              <span
                className={`font-medium ${
                  saveStatus === "success" ? "text-green-800" : "text-red-800"
                }`}
              >
                {saveStatus === "success"
                  ? "Configuración guardada correctamente"
                  : "Error al guardar la configuración"}
              </span>
            </div>
          )}

          {/* Configuration form */}
          <div className="space-y-6">
            <form onSubmit={handleSaveConfig} className="space-y-6">
          {/* Business Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>Nombre del Negocio</span>
            </label>
            <input
              type="text"
              value={formData.business_name}
              onChange={(e) =>
                setFormData({ ...formData, business_name: e.target.value })
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              placeholder="Ej: Salón de Belleza Elegancia"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>Dirección</span>
            </label>
            <textarea
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
              placeholder="Ej: Av. Principal 123, Centro, Ciudad"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
              <Phone className="w-4 h-4 text-blue-600" />
              <span>Teléfono</span>
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              placeholder="Ej: +52 55 1234 5678"
            />
          </div>

          {/* WhatsApp */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
              <MessageCircle className="w-4 h-4 text-blue-600" />
              <span>WhatsApp</span>
            </label>
            <input
              type="tel"
              value={formData.whatsapp}
              onChange={(e) =>
                setFormData({ ...formData, whatsapp: e.target.value })
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              placeholder="Ej: +52 55 1234 5678"
            />
            <p className="text-sm text-slate-500 mt-1">
              Se usará para notificaciones automáticas de citas
            </p>
          </div>

          {/* Google Maps URL */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
              <Map className="w-4 h-4 text-blue-600" />
              <span>URL de Google Maps</span>
            </label>
            <input
              type="url"
              value={formData.google_maps_url}
              onChange={(e) =>
                setFormData({ ...formData, google_maps_url: e.target.value })
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              placeholder="https://maps.google.com/..."
            />
            <p className="text-sm text-slate-500 mt-1">
              Los clientes podrán ver tu ubicación en el mapa
            </p>
          </div>

          {/* Profile Image */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
              <ImageIcon className="w-4 h-4 text-blue-600" />
              <span>Imagen de Perfil</span>
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {formData.profile_image_url ? (
                <div className="relative group">
                  <img
                    src={formData.profile_image_url}
                    alt="Perfil"
                    className="w-32 h-32 rounded-full object-cover border-4 border-slate-200 shadow-lg"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage("profile")}
                    className="absolute top-0 right-0 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="w-32 h-32 rounded-full bg-slate-100 border-4 border-slate-200 flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-slate-400" />
                </div>
              )}
              <div className="flex-1">
                <input
                  type="file"
                  ref={profileInputRef}
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleImageUpload(file, "profile");
                    }
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => profileInputRef.current?.click()}
                  disabled={uploadingProfile}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {uploadingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Subiendo...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>{formData.profile_image_url ? "Cambiar imagen" : "Subir imagen"}</span>
                    </>
                  )}
                </button>
                <p className="text-xs text-slate-500 mt-2">
                  Imagen cuadrada recomendada (máx. 5MB)
                </p>
              </div>
            </div>
          </div>

          {/* Header Image */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
              <ImageIcon className="w-4 h-4 text-blue-600" />
              <span>Imagen de Cabecera</span>
            </label>
            <div className="space-y-4">
              {formData.header_image_url ? (
                <div className="relative group">
                  <img
                    src={formData.header_image_url}
                    alt="Cabecera"
                    className="w-full h-48 rounded-xl object-cover border border-slate-200 shadow-lg"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage("header")}
                    className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="w-full h-48 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                  <ImageIcon className="w-16 h-16 text-slate-400" />
                </div>
              )}
              <div>
                <input
                  type="file"
                  ref={headerInputRef}
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleImageUpload(file, "header");
                    }
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => headerInputRef.current?.click()}
                  disabled={uploadingHeader}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {uploadingHeader ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Subiendo...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>{formData.header_image_url ? "Cambiar imagen" : "Subir imagen"}</span>
                    </>
                  )}
                </button>
                <p className="text-xs text-slate-500 mt-2">
                  Imagen horizontal recomendada 16:9 (máx. 5MB)
                </p>
              </div>
            </div>
          </div>

          {/* Submit button */}
          <div className="flex items-center space-x-3 pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>
          </div>
        </form>
          </div>

          {/* URL info */}
          {selectedTenant && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <h3 className="font-semibold text-blue-900 mb-2">
                URL de tu página pública
              </h3>
              <div className="flex items-center space-x-2">
                <code className="flex-1 px-4 py-2 bg-white rounded-lg text-blue-600 font-mono text-sm">
                  {window.location.origin}/{selectedTenant.slug}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/${selectedTenant.slug}`
                    );
                    alert("URL copiada al portapapeles");
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Copiar
                </button>
              </div>
              <p className="text-sm text-blue-700 mt-2">
                Comparte esta URL con tus clientes para que puedan hacer reservas
              </p>
            </div>
          )}
            </>
          )}
          {activeTab === "social" && (
            <div className="pt-4">
              <DashboardSocialPage />
            </div>
          )}
          {activeTab === "payments" && (
            <div className="pt-4">
              <DashboardPaymentsPage />
            </div>
          )}
          {activeTab === "customize" && (
            <div className="pt-4">
              <DashboardCustomizePage />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Globe,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import type { Tenant, SocialNetwork } from "@/shared/types";
import {
  YoutubeIcon,
  FacebookIcon,
  InstagramIcon,
  TwitterIcon,
  TikTokIcon,
  LinkedInIcon,
  TwitchIcon,
  GithubIcon,
  OnlyFansIcon,
} from "@/react-app/components/SocialIcons";

interface PlatformIcon {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PLATFORMS: PlatformIcon[] = [
  { value: "youtube", label: "YouTube", icon: YoutubeIcon },
  { value: "facebook", label: "Facebook", icon: FacebookIcon },
  { value: "instagram", label: "Instagram", icon: InstagramIcon },
  { value: "twitter", label: "Twitter/X", icon: TwitterIcon },
  { value: "tiktok", label: "TikTok", icon: TikTokIcon },
  { value: "linkedin", label: "LinkedIn", icon: LinkedInIcon },
  { value: "onlyfans", label: "OnlyFans", icon: OnlyFansIcon },
  { value: "twitch", label: "Twitch", icon: TwitchIcon },
  { value: "github", label: "GitHub", icon: GithubIcon },
];

export default function DashboardSocialPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<number | null>(null);
  const [socialNetworks, setSocialNetworks] = useState<SocialNetwork[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newPlatform, setNewPlatform] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [formData, setFormData] = useState<{ [key: number]: { url: string; is_active: boolean } }>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      fetchSocialNetworks();
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

  const fetchSocialNetworks = async () => {
    if (!selectedTenant) return;

    try {
      const response = await fetch(`/api/social?tenant_id=${selectedTenant}`);
      if (response.ok) {
        const data = await response.json();
        setSocialNetworks(data);

        // Initialize form data
        const initialFormData: { [key: number]: { url: string; is_active: boolean } } = {};
        data.forEach((network: SocialNetwork) => {
          initialFormData[network.id] = {
            url: network.url,
            is_active: network.is_active,
          };
        });
        setFormData(initialFormData);
      }
    } catch (error) {
      console.error("Error al cargar redes sociales:", error);
    }
  };

  const handleCreate = async () => {
    if (!selectedTenant || !newPlatform || !newUrl) {
      alert("Por favor selecciona una red social e ingresa una URL");
      return;
    }

    try {
      const response = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: selectedTenant,
          platform: newPlatform,
          url: newUrl,
          is_active: true,
        }),
      });

      if (response.ok) {
        setNewPlatform("");
        setNewUrl("");
        await fetchSocialNetworks();
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        const error = await response.json();
        alert(error.error || "Error al crear red social");
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch (error) {
      console.error("Error al crear red social:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const handleUpdate = async (id: number) => {
    if (!formData[id]) return;

    try {
      const response = await fetch(`/api/social/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData[id]),
      });

      if (response.ok) {
        setEditingId(null);
        await fetchSocialNetworks();
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch (error) {
      console.error("Error al actualizar red social:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar esta red social?")) {
      return;
    }

    try {
      const response = await fetch(`/api/social/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchSocialNetworks();
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch (error) {
      console.error("Error al eliminar red social:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const getPlatformInfo = (platform: string) => {
    return PLATFORMS.find((p) => p.value === platform) || {
      value: platform,
      label: platform,
      icon: Globe,
    };
  };

  const availablePlatforms = PLATFORMS.filter(
    (p) => !socialNetworks.some((sn) => sn.platform === p.value)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-12 animate-fade-in-up">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-12 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Globe className="w-10 h-10 text-slate-300" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            No tienes negocios creados
          </h2>
          <p className="text-slate-500 mb-6">
            Crea un negocio primero para poder agregar redes sociales
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
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Redes Sociales</h2>
          <p className="text-slate-500 mt-1 text-lg">
            Gestiona los enlaces a tus perfiles sociales públicos
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
        </div>
      </div>

      {/* Save status */}
      {saveStatus !== "idle" && (
        <div
          className={`rounded-xl p-4 flex items-center space-x-3 shadow-sm ${saveStatus === "success"
              ? "bg-emerald-50 border border-emerald-100 text-emerald-800"
              : "bg-rose-50 border border-rose-100 text-rose-800"
            }`}
        >
          {saveStatus === "success" ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="font-medium">
            {saveStatus === "success"
              ? "Cambios guardados correctamente"
              : "Error al guardar los cambios"}
          </span>
        </div>
      )}

      {/* Add new platform */}
      {availablePlatforms.length > 0 && (
        <div className="bg-white rounded-3xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-200 p-6 sm:p-8">
          <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-600" />
            Agregar nueva red social
          </h3>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
                1. Elige una plataforma
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {availablePlatforms.map((platform) => {
                  const IconComponent = platform.icon;
                  const isSelected = newPlatform === platform.value;
                  return (
                    <button
                      key={platform.value}
                      type="button"
                      onClick={() => setNewPlatform(platform.value)}
                      className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 h-28 ${isSelected
                          ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/20 ring-offset-2"
                          : "border-slate-100 hover:border-indigo-200 hover:bg-slate-50 bg-white"
                        }`}
                    >
                      <IconComponent className={`w-8 h-8 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span className={`text-xs font-bold ${isSelected ? 'text-indigo-700' : 'text-slate-600'}`}>{platform.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {newPlatform && (
              <div className="animate-fade-in-up">
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
                  2. Ingresa la URL de tu perfil
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <div className="flex-1 relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Globe className="w-5 h-5" />
                    </div>
                    <input
                      type="url"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder={`https://www.${newPlatform}.com/tu-usuario`}
                      className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium"
                    />
                  </div>
                  <button
                    onClick={handleCreate}
                    disabled={!newUrl}
                    className="inline-flex items-center justify-center space-x-2 px-8 py-3.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                  >
                    <Save className="w-5 h-5" />
                    <span>Guardar Red Social</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Social networks list */}
      {socialNetworks.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Globe className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            No has añadido redes sociales
          </h3>
          <p className="text-slate-500 max-w-sm mx-auto">
            Añade tus perfiles para que tus clientes puedan seguirte y contactarte fácilmente.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr>
                  <th className="px-8 py-5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Plataforma
                  </th>
                  <th className="px-8 py-5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-1/2">
                    URL del Perfil
                  </th>
                  <th className="px-8 py-5 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-8 py-5 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {socialNetworks.map((network) => {
                  const platformInfo = getPlatformInfo(network.platform);
                  const isEditing = editingId === network.id;
                  const IconComponent = platformInfo.icon;

                  return (
                    <tr key={network.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                            <IconComponent className="w-5 h-5" />
                          </div>
                          <span className="font-bold text-slate-900">
                            {platformInfo.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        {isEditing ? (
                          <input
                            type="url"
                            value={formData[network.id]?.url || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                [network.id]: {
                                  ...formData[network.id],
                                  url: e.target.value,
                                },
                              })
                            }
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm font-medium"
                            placeholder="https://..."
                          />
                        ) : (
                          <a
                            href={network.url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-600 hover:text-indigo-600 font-medium text-sm truncate max-w-xs block transition-colors underline decoration-slate-200 hover:decoration-indigo-300 underline-offset-4"
                          >
                            {network.url || "Sin URL"}
                          </a>
                        )}
                      </td>
                      <td className="px-8 py-5 text-center">
                        {isEditing ? (
                          <label className="relative inline-flex items-center cursor-pointer justify-center">
                            <input
                              type="checkbox"
                              checked={formData[network.id]?.is_active || false}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  [network.id]: {
                                    ...formData[network.id],
                                    is_active: e.target.checked,
                                  },
                                })
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                          </label>
                        ) : (
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide inline-flex items-center gap-1.5 ${network.is_active
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : "bg-slate-50 text-slate-500 border border-slate-100"
                              }`}
                          >
                            {network.is_active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                            {network.is_active ? "Activa" : "Inactiva"}
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleUpdate(network.id)}
                                className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                title="Guardar"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  fetchSocialNetworks();
                                }}
                                className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                                title="Cancelar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setEditingId(network.id)}
                                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors shadow-sm"
                                title="Editar"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(network.id)}
                                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors shadow-sm"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  LogOut,
  ExternalLink,
  Power,
  PowerOff,
  Trash2,
  Key,
  Loader2,
  MessageCircle,
} from "lucide-react";

type Business = {
  tenant_id: number;
  slug: string;
  is_active: boolean;
  owner_user_id: string;
  owner_email: string;
  whatsapp: string | null;
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [changePasswordFor, setChangePasswordFor] = useState<{ id: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const checkAdmin = async () => {
    const res = await fetch("/api/admin/me", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!data.admin) {
      navigate("/admin", { replace: true });
      return false;
    }
    return true;
  };

  const fetchBusinesses = async () => {
    const res = await fetch("/api/admin/businesses", { credentials: "include" });
    if (!res.ok) {
      setError("No se pudieron cargar los negocios");
      return;
    }
    const data = await res.json();
    setBusinesses(data);
  };

  useEffect(() => {
    (async () => {
      const ok = await checkAdmin();
      if (!ok) return;
      await fetchBusinesses();
      setLoading(false);
    })();
  }, [navigate]);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    navigate("/admin", { replace: true });
  };

  const setActive = async (tenantId: number, isActive: boolean) => {
    const key = `active-${tenantId}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`/api/admin/businesses/${tenantId}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: isActive }),
      });
      if (res.ok) await fetchBusinesses();
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleDelete = async (tenantId: number, slug: string) => {
    if (!confirm(`¿Eliminar el negocio "${slug}" y todos sus datos? Esta acción no se puede deshacer.`)) return;
    const key = `delete-${tenantId}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`/api/admin/businesses/${tenantId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) await fetchBusinesses();
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const whatsappUrl = (whatsapp: string | null) => {
    if (!whatsapp) return null;
    const digits = whatsapp.replace(/\D/g, "");
    if (!digits.length) return null;
    return `https://wa.me/${digits}`;
  };

  const openChangePassword = (userId: string, email: string) => {
    setChangePasswordFor({ id: userId, email });
    setNewPassword("");
    setPasswordError("");
  };

  const submitChangePassword = async () => {
    if (!changePasswordFor) return;
    if (newPassword.length < 6) {
      setPasswordError("Mínimo 6 caracteres");
      return;
    }
    setPasswordError("");
    const res = await fetch(`/api/admin/users/${changePasswordFor.id}/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ new_password: newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPasswordError(data.error || "Error al cambiar contraseña");
      return;
    }
    setChangePasswordFor(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Admin – Negocios</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Salir
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-4">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Correo</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">WhatsApp</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Dominio / slug</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Estado</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => (
                  <tr key={b.tenant_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-3 px-4 text-slate-800">{b.owner_email}</td>
                    <td className="py-3 px-4 text-slate-600">{b.whatsapp || "—"}</td>
                    <td className="py-3 px-4">
                      <a
                        href={`/${b.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {b.slug}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          b.is_active
                            ? "text-green-700 bg-green-50 px-2 py-0.5 rounded"
                            : "text-slate-500 bg-slate-100 px-2 py-0.5 rounded"
                        }
                      >
                        {b.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {whatsappUrl(b.whatsapp) && (
                          <a
                            href={whatsappUrl(b.whatsapp)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Abrir chat con el dueño del negocio"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                        {b.is_active ? (
                          <button
                            type="button"
                            onClick={() => setActive(b.tenant_id, false)}
                            disabled={!!actionLoading[`active-${b.tenant_id}`]}
                            className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Desactivar negocio"
                          >
                            <PowerOff className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActive(b.tenant_id, true)}
                            disabled={!!actionLoading[`active-${b.tenant_id}`]}
                            className="p-2 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Activar negocio"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openChangePassword(b.owner_user_id, b.owner_email)}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Cambiar contraseña"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(b.tenant_id, b.slug)}
                          disabled={!!actionLoading[`delete-${b.tenant_id}`]}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Eliminar negocio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {businesses.length === 0 && (
            <div className="py-12 text-center text-slate-500">No hay negocios registrados.</div>
          )}
        </div>
      </main>

      {changePasswordFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Cambiar contraseña</h2>
            <p className="text-sm text-slate-600 mb-4">{changePasswordFor.email}</p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nueva contraseña (mín. 6 caracteres)"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none mb-2"
            />
            {passwordError && (
              <p className="text-sm text-red-600 mb-2">{passwordError}</p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setChangePasswordFor(null)}
                className="flex-1 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitChangePassword}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

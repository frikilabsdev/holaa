import { useState, useEffect, useRef } from "react";
import { X, Upload, Image as ImageIcon, Trash2, Loader2 } from "lucide-react";
import type { Service, ServiceImage } from "@/shared/types";

// Función para comprimir imagen usando Canvas API
async function compressImage(file: File, maxWidth: number = 800, maxHeight: number = 800, quality: number = 0.85): Promise<Blob> {
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
}

interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (service: Partial<Service>) => Promise<void>;
  service?: Service | null;
  tenantId: number;
}

export default function ServiceModal({
  isOpen,
  onClose,
  service,
  onSave,
  tenantId,
}: ServiceModalProps) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    duration_minutes: "",
    max_simultaneous_bookings: "1",
    is_active: true,
  });
  const [mainImageUrl, setMainImageUrl] = useState<string | null>(null);
  const [additionalImages, setAdditionalImages] = useState<ServiceImage[]>([]);
  const [uploadingMainImage, setUploadingMainImage] = useState(false);
  const [uploadingAdditionalImages, setUploadingAdditionalImages] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  const additionalImagesInputRef = useRef<HTMLInputElement>(null);

  // Load service data and images when modal opens
  useEffect(() => {
    if (service && isOpen) {
      setFormData({
        title: service.title,
        description: service.description || "",
        price: service.price?.toString() || "",
        duration_minutes: service.duration_minutes?.toString() || "",
        max_simultaneous_bookings: service.max_simultaneous_bookings?.toString() || "1",
        is_active: service.is_active,
      });
      setMainImageUrl(service.main_image_url || null);
      fetchServiceImages();
    } else {
      setFormData({
        title: "",
        description: "",
        price: "",
        duration_minutes: "",
        max_simultaneous_bookings: "1",
        is_active: true,
      });
      setMainImageUrl(null);
      setAdditionalImages([]);
    }
  }, [service, isOpen]);

  const fetchServiceImages = async () => {
    if (!service?.id) return;

    try {
      const response = await fetch(`/api/service-images/service/${service.id}`);
      if (response.ok) {
        const images = await response.json();
        setAdditionalImages(images || []);
      }
    } catch (error) {
      console.error("Error al cargar imágenes:", error);
    }
  };

  const handleMainImageUpload = async (file: File) => {
    setUploadingMainImage(true);

    try {
      // Validar tamaño (máx 10MB antes de comprimir)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        alert("El archivo es demasiado grande. Máximo 10MB");
        return;
      }

      // Comprimir imagen (800x800px máximo para imágenes de servicios)
      const compressedBlob = await compressImage(file, 800, 800, 0.85);
      const compressedFile = new File([compressedBlob], file.name, { type: "image/jpeg" });

      console.log(`Imagen comprimida: ${file.size} bytes -> ${compressedBlob.size} bytes (${Math.round((1 - compressedBlob.size / file.size) * 100)}% reducción)`);

      const formDataToUpload = new FormData();
      formDataToUpload.append("file", compressedFile);

      const uploadResponse = await fetch("/api/upload/image", {
        method: "POST",
        body: formDataToUpload,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(errorData.error || "Error al subir la imagen");
      }

      const uploadData = await uploadResponse.json();
      setMainImageUrl(uploadData.url);
    } catch (error: any) {
      console.error("Error al subir imagen principal:", error);
      alert(error.message || "Error al subir la imagen principal");
    } finally {
      setUploadingMainImage(false);
    }
  };

  const handleAdditionalImagesUpload = async (files: FileList) => {
    if (!service?.id) {
      alert("Primero guarda el servicio para agregar imágenes adicionales");
      return;
    }

    const fileArray = Array.from(files);
    const uploadingIds = new Set<number>();

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const tempId = Date.now() + i;
      uploadingIds.add(tempId);
      setUploadingAdditionalImages((prev) => new Set([...prev, tempId]));

      try {
        // Validar tamaño (máx 10MB antes de comprimir)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
          alert(`El archivo ${file.name} es demasiado grande. Máximo 10MB`);
          continue;
        }

        // Comprimir imagen (800x800px máximo para imágenes adicionales)
        const compressedBlob = await compressImage(file, 800, 800, 0.85);
        const compressedFile = new File([compressedBlob], file.name, { type: "image/jpeg" });

        console.log(`Imagen comprimida: ${file.name} - ${file.size} bytes -> ${compressedBlob.size} bytes (${Math.round((1 - compressedBlob.size / file.size) * 100)}% reducción)`);

        const formDataToUpload = new FormData();
        formDataToUpload.append("file", compressedFile);

        const uploadResponse = await fetch("/api/upload/image", {
          method: "POST",
          body: formDataToUpload,
        });

        if (!uploadResponse.ok) {
          throw new Error("Error al subir la imagen");
        }

        const uploadData = await uploadResponse.json();

        // Create service image record
        const createResponse = await fetch("/api/service-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_id: service.id,
            image_url: uploadData.url,
            display_order: additionalImages.length + i,
          }),
        });

        if (createResponse.ok) {
          const newImage = await createResponse.json();
          setAdditionalImages((prev) => [...prev, newImage]);
        }
      } catch (error: any) {
        console.error("Error al subir imagen adicional:", error);
        alert(error.message || `Error al subir la imagen ${i + 1}`);
      } finally {
        setUploadingAdditionalImages((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });
      }
    }
  };

  const handleDeleteAdditionalImage = async (imageId: number) => {
    if (!confirm("¿Estás seguro de eliminar esta imagen?")) {
      return;
    }

    try {
      const response = await fetch(`/api/service-images/${imageId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setAdditionalImages((prev) => prev.filter((img) => img.id !== imageId));
      }
    } catch (error) {
      console.error("Error al eliminar imagen:", error);
      alert("Error al eliminar la imagen");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const serviceData: Partial<Service> = {
        title: formData.title,
        description: formData.description || null,
        price: formData.price ? parseFloat(formData.price) : null,
        duration_minutes: formData.duration_minutes ? parseInt(formData.duration_minutes) : null,
        max_simultaneous_bookings: formData.max_simultaneous_bookings ? parseInt(formData.max_simultaneous_bookings) : 1,
        is_active: formData.is_active,
        main_image_url: mainImageUrl || null,
      };

      // Only include tenant_id when creating a new service
      if (!service) {
        serviceData.tenant_id = tenantId;
      }

      await onSave(serviceData);

      // If creating a new service, fetch it to get the ID for additional images
      if (!service && isOpen) {
        // Wait a bit for the service to be created
        await new Promise((resolve) => setTimeout(resolve, 500));
        // The parent component should refresh the list, but we close the modal
      }

      onClose();
    } catch (error: any) {
      console.error("Error al guardar servicio:", error);
      const errorMessage = error.message || "Error al guardar el servicio. Por favor intenta de nuevo.";
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-2xl font-bold text-slate-900">
            {service ? "Editar Servicio" : "Nuevo Servicio"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Main Image */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Imagen Principal del Servicio
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Esta imagen se mostrará en las tarjetas de servicios (círculo)
            </p>
            <input
              type="file"
              ref={mainImageInputRef}
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleMainImageUpload(file);
                }
              }}
              className="hidden"
            />
            <div className="flex items-center space-x-4">
              {mainImageUrl ? (
                <>
                  <div className="relative group">
                    <img
                      src={mainImageUrl}
                      alt="Imagen principal"
                      className="w-20 h-20 rounded-full object-cover border-2 border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setMainImageUrl(null)}
                      className="absolute -top-1 -right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => mainImageInputRef.current?.click()}
                    disabled={uploadingMainImage}
                    className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {uploadingMainImage ? "Subiendo..." : "Cambiar Imagen"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => mainImageInputRef.current?.click()}
                  disabled={uploadingMainImage}
                  className="flex items-center space-x-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  {uploadingMainImage ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      <span className="text-slate-700">Subiendo...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-slate-600" />
                      <span className="text-slate-700">Subir Imagen Principal</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Título del Servicio *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              placeholder="Ej: Corte de cabello"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Descripción Resumida (para tarjeta)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={2}
              maxLength={150}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
              placeholder="Descripción breve que aparecerá en la tarjeta (máx. 150 caracteres)..."
            />
            <p className="text-xs text-slate-500 mt-1">
              {formData.description.length}/150 caracteres
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Nota: La descripción completa se puede agregar después desde el modal de detalles
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Precio
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                  className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Duración (minutos)
              </label>
              <input
                type="number"
                min="1"
                value={formData.duration_minutes}
                onChange={(e) =>
                  setFormData({ ...formData, duration_minutes: e.target.value })
                }
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                placeholder="60"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Cupos simultáneos
            </label>
            <input
              type="number"
              min="1"
              required
              value={formData.max_simultaneous_bookings}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  max_simultaneous_bookings: e.target.value,
                })
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            />
            <p className="text-sm text-slate-500 mt-1">
              Número de clientes que pueden reservar en el mismo horario
            </p>
          </div>

          {/* Additional Images */}
          {service && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Imágenes Adicionales
              </label>
              <p className="text-xs text-slate-500 mb-3">
                Estas imágenes se mostrarán en el modal de detalles del servicio (galería)
              </p>
              <input
                type="file"
                ref={additionalImagesInputRef}
                accept="image/jpeg,image/jpg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    handleAdditionalImagesUpload(files);
                  }
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => additionalImagesInputRef.current?.click()}
                disabled={uploadingAdditionalImages.size > 0}
                className="flex items-center space-x-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {uploadingAdditionalImages.size > 0 ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    <span className="text-slate-700">Subiendo imágenes...</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-5 h-5 text-slate-600" />
                    <span className="text-slate-700">Agregar Imágenes Adicionales</span>
                  </>
                )}
              </button>

              {additionalImages.length > 0 && (
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {additionalImages.map((image) => (
                    <div key={image.id} className="relative group">
                      <img
                        src={image.image_url}
                        alt={`Imagen ${image.id}`}
                        className="w-full h-24 object-cover rounded-lg border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteAdditionalImage(image.id)}
                        className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!service && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800">
                <strong>Nota:</strong> Para agregar imágenes adicionales, primero guarda el servicio y luego edítalo.
              </p>
            </div>
          )}

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
              className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
            />
            <label
              htmlFor="is_active"
              className="text-sm font-medium text-slate-700 cursor-pointer"
            >
              Servicio activo (visible para clientes)
            </label>
          </div>

          <div className="flex items-center space-x-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Cloudflare Workers environment bindings
interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  SESSIONS_KV: KVNamespace;
  /** Contraseña para acceso al panel de administración (admin.citame.click). Configurar como secret en Cloudflare. */
  ADMIN_PASSWORD?: string;
  /** Número de contacto de soporte Citame (solo dígitos con código de país). Configurar en Variables and Secrets. */
  SUPPORT_PHONE?: string;
}

// Types for Hono context variables
interface HonoContextVariables {
  user?: {
    id: string;
    email: string;
  };
  requestId?: string;
}

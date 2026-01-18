// Cloudflare Workers environment bindings
interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  SESSIONS_KV: KVNamespace;
}

// Types for Hono context variables
interface HonoContextVariables {
  user?: {
    id: string;
    email: string;
  };
  requestId?: string;
}

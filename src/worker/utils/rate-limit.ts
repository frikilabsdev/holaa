/**
 * Rate limiting utility using Cloudflare KV
 * Tracks requests per IP address with sliding window
 */

// Types for Cloudflare Workers
type KVNamespace = {
  get(key: string, type?: "text" | "json"): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

export interface RateLimitOptions {
  limit: number; // Maximum number of requests
  window: number; // Time window in seconds
  keyPrefix: string; // Prefix for KV key
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number; // Unix timestamp when limit resets
}

/**
 * Check if a request is within rate limit
 */
export async function checkRateLimit(
  kv: KVNamespace,
  identifier: string, // Usually IP address
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const key = `${options.keyPrefix}:${identifier}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - options.window;

  try {
    // Get existing entries
    const existingData = await kv.get(key, "json") as { timestamps: number[] } | null;
    
    const timestamps = existingData?.timestamps || [];
    
    // Filter timestamps within the current window
    const validTimestamps = timestamps.filter((ts: number) => ts > windowStart);
    
    // Check if limit exceeded
    if (validTimestamps.length >= options.limit) {
      const oldestTimestamp = Math.min(...validTimestamps);
      const resetTime = oldestTimestamp + options.window;
      
      return {
        allowed: false,
        remaining: 0,
        reset: resetTime,
      };
    }
    
    // Add current timestamp
    validTimestamps.push(now);
    
    // Store updated timestamps with expiration
    await kv.put(key, JSON.stringify({ timestamps: validTimestamps }), {
      expirationTtl: options.window + 60, // Keep for window + 1 minute buffer
    });
    
    return {
      allowed: true,
      remaining: options.limit - validTimestamps.length,
      reset: now + options.window,
    };
  } catch (error) {
    console.error("Rate limit check error:", error);
    // On error, allow the request (fail open for availability)
    return {
      allowed: true,
      remaining: options.limit,
      reset: now + options.window,
    };
  }
}

/**
 * Get client IP address from Hono request
 */
export function getClientIP(request: { header: (name: string) => string | undefined } | Request): string {
  // Handle Hono request object
  if (typeof (request as any).header === "function") {
    const honoRequest = request as { header: (name: string) => string | undefined };
    
    // Check Cloudflare headers first
    const cfConnectingIP = honoRequest.header("CF-Connecting-IP");
    if (cfConnectingIP) return cfConnectingIP;
    
    // Fallback to X-Forwarded-For
    const xForwardedFor = honoRequest.header("X-Forwarded-For");
    if (xForwardedFor) {
      return xForwardedFor.split(",")[0].trim();
    }
  }
  
  // Handle native Request object
  if (request instanceof Request) {
    // Check Cloudflare headers first
    const cfConnectingIP = request.headers.get("CF-Connecting-IP");
    if (cfConnectingIP) return cfConnectingIP;
    
    // Fallback to X-Forwarded-For
    const xForwardedFor = request.headers.get("X-Forwarded-For");
    if (xForwardedFor) {
      return xForwardedFor.split(",")[0].trim();
    }
  }
  
  // Last resort: use a default identifier
  return "unknown";
}

/**
 * Structured logging utility for Cloudflare Workers
 * Provides consistent JSON logging format for better observability
 */

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  userId?: string;
  path?: string;
  method?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  context?: LogContext;
}

/**
 * Structured logger for Cloudflare Workers
 */
class Logger {
  private isDevelopment: boolean;

  constructor() {
    // In production, Cloudflare Workers automatically sets NODE_ENV
    // For local development, check URL
    this.isDevelopment = typeof globalThis !== "undefined" && 
      ((globalThis as any).location?.hostname === "localhost" || 
       (globalThis as any).location?.hostname === "127.0.0.1");
  }

  /**
   * Log an entry in structured format
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(context && { context }),
    };

    // In production, log as JSON for structured logging systems
    // In development, log in a more readable format
    if (this.isDevelopment) {
      const prefix = `[${entry.level}]`;
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      console.log(`${prefix} [${timestamp}] ${message}`, context || "");
    } else {
      // JSON format for production (Cloudflare Analytics Engine can parse this)
      console.log(JSON.stringify(entry));
    }
  }

  /**
   * Log debug message (only in development)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      this.log(LogLevel.DEBUG, message, context);
    }
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext: LogContext = {
      ...context,
    };

    if (error instanceof Error) {
      errorContext.error = {
        name: error.name,
        message: error.message,
        ...(this.isDevelopment && error.stack && { stack: error.stack }),
      };
    } else if (error) {
      errorContext.error = {
        name: "UnknownError",
        message: String(error),
      };
    }

    this.log(LogLevel.ERROR, message, errorContext);
  }

  /**
   * Log request with timing
   */
  request(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    context?: LogContext
  ): void {
    const level = statusCode >= 500 ? LogLevel.ERROR : 
                  statusCode >= 400 ? LogLevel.WARN : 
                  LogLevel.INFO;

    this.log(level, `${method} ${path} ${statusCode}`, {
      ...context,
      method,
      path,
      statusCode,
      duration,
    });
  }
}

// Export singleton instance
export const logger = new Logger();

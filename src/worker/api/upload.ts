import { Hono } from "hono";
import { authMiddleware } from "@/worker/api/auth";

const app = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

// Upload image to R2
app.post("/image", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "No autenticado" }, 401);
  }

  const formData = await c.req.formData();
  const fileEntry = formData.get("file");
  
  if (!fileEntry || typeof fileEntry === "string") {
    return c.json({ error: "Archivo no proporcionado" }, 400);
  }
  
  const file = fileEntry as File;

  // Validate file type
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type)) {
    return c.json(
      { error: "Tipo de archivo no válido. Solo se permiten JPEG, PNG o WebP" },
      400
    );
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return c.json({ error: "El archivo es demasiado grande. Máximo 5MB" }, 400);
  }

  // Generate unique filename
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const fileExtension = file.name.split(".").pop() || "jpg";
  const fileName = `${user.id}/${timestamp}-${randomString}.${fileExtension}`;

  try {
    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Upload to R2
    console.log(`[Upload API] Subiendo archivo a R2: ${fileName}, tamaño: ${file.size}`);
    const putResult = await c.env.R2_BUCKET.put(fileName, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        originalName: file.name,
        uploadedBy: user.id,
        uploadedAt: new Date().toISOString(),
      },
    });
    console.log(`[Upload API] Archivo subido exitosamente a R2: ${fileName}`, putResult);

    // Verify the file was uploaded
    const verifyObject = await c.env.R2_BUCKET.get(fileName);
    if (!verifyObject) {
      console.error(`[Upload API] ERROR: El archivo no se encontró después de subirlo: ${fileName}`);
      throw new Error("Error: El archivo no se pudo verificar después de la subida");
    }
    console.log(`[Upload API] Archivo verificado en R2: ${fileName}, tamaño: ${verifyObject.size}`);

    // Get public URL (assuming R2 public access or using Cloudflare CDN)
    // For now, we'll return a path that can be served through the worker
    const imageUrl = `/api/upload/files/${fileName}`;

    return c.json({
      url: imageUrl,
      fileName,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return c.json({ error: "Error al subir el archivo" }, 500);
  }
});

// Serve files from R2 (public endpoint)
app.get("/files/:path(*)", async (c) => {
  const filePath = c.req.param("path");
  if (!filePath) {
    return c.json({ error: "Ruta de archivo no proporcionada" }, 400);
  }
  console.log(`[Upload API] GET /files/${filePath} - Intentando obtener archivo`);

  try {
    const object = await c.env.R2_BUCKET.get(filePath);

    if (!object) {
      console.error(`[Upload API] Archivo no encontrado en R2: ${filePath}`);
      // Try to list objects to debug
      try {
        if (filePath) {
          const prefix = filePath.split("/")[0] + "/";
          const listResult = await c.env.R2_BUCKET.list({ prefix });
          console.log(`[Upload API] Archivos en R2 con prefijo "${prefix}":`, listResult.objects?.map(o => o.key) || []);
        }
      } catch (listError) {
        console.error(`[Upload API] Error al listar objetos:`, listError);
      }
      return c.json({ error: "Archivo no encontrado", path: filePath || "unknown" }, 404);
    }

    console.log(`[Upload API] Archivo encontrado: ${filePath}, tamaño: ${object.size}`);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    
      // Ensure Content-Type is set correctly for images
      if (!headers.get("Content-Type") && filePath) {
        const ext = filePath.split(".").pop()?.toLowerCase();
      const contentTypeMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
      };
      headers.set("Content-Type", contentTypeMap[ext || ""] || "application/octet-stream");
    }
    
    // Set CORS headers to allow images to be loaded from anywhere
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(object.body, {
      headers,
    });
  } catch (error) {
    console.error(`[Upload API] Error serving file ${filePath}:`, error);
    return c.json({ error: "Error al obtener el archivo", details: String(error) }, 500);
  }
});

export default app;

# 🚀 Pasos para Configurar Dokploy

## Paso 1: Crear Aplicación en Dokploy

1. Abre tu Dokploy
2. Clic en **"New Application"** o **"Nueva Aplicación"**
3. Selecciona **"GitHub"** o **"Git Repository"** como fuente
4. Conecta el repositorio: `https://github.com/frikilabsdev/holaa`
5. Tipo de aplicación: **Cloudflare Workers** o **Node.js**

## Paso 2: Configurar Build Settings

**Build Command:**
```bash
npm ci && npm run build
```

**Output Directory:**
```
dist
```

**Root Directory:**
```
/
```

## Paso 3: Variables de Entorno en Dokploy

Ve a **"Environment Variables"** o **"Variables de Entorno"** en Dokploy y agrega:

### Requeridas:

1. **CLOUDFLARE_ACCOUNT_ID**
   - Encuéntralo en: Cloudflare Dashboard → Right sidebar → Account ID

2. **CLOUDFLARE_API_TOKEN**
   - Ve a Cloudflare Dashboard → My Profile → API Tokens
   - Clic en "Create Token"
   - Template: "Edit Cloudflare Workers"
   - Permisos:
     - Account: Workers Scripts (Edit)
     - Account: Account Settings (Read)
     - Zone: Zone Settings (Read)
     - Zone: Zone (Read)

## Paso 4: Configurar Cloudflare Resources

### D1 Database

Si no existe, créalo:
```bash
npx wrangler d1 create citas-database
```

Copia el `database_id` que aparece y actualiza en `wrangler.json`

### R2 Bucket

Si no existe:
```bash
npx wrangler r2 bucket create citas-images
```

Actualiza `bucket_name` en `wrangler.json`

### KV Namespace

Si no existe:
```bash
npx wrangler kv:namespace create "SESSIONS_KV"
npx wrangler kv:namespace create "SESSIONS_KV" --preview
```

Copia los IDs y actualiza en `wrangler.json`

## Paso 5: Deploy Command

En Dokploy, configura el **Deploy Command**:

```bash
npx wrangler deploy
```

## Paso 6: Aplicar Migraciones

Después del primer deploy, aplica migraciones:

```bash
npx wrangler d1 migrations apply [TU_DATABASE_ID] --remote
```

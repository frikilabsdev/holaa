# Deploy automático con GitHub Actions

Cada **push a la rama `main`** despliega automáticamente a Cloudflare Workers. El workflow está en `.github/workflows/deploy.yml`.

## Requisitos

1. **Secrets** en uno de estos sitios:
   - **Repository secrets:** Settings → Secrets and variables → Actions → Repository secrets.
   - **Environment secrets:** Settings → Environments → crea o usa un environment (p. ej. `production`) y añade ahí los secrets. El workflow usa `environment: production` para acceder a ellos.
   - **`CLOUDFLARE_API_TOKEN`** (obligatorio): Token de API de Cloudflare con permiso para editar Workers.
   - **`CLOUDFLARE_ACCOUNT_ID`** (recomendado): ID de tu cuenta de Cloudflare (evita el error "No account id found").
   - Si usas un Environment con otro nombre (p. ej. `cloudflare`), edita `.github/workflows/deploy.yml` y cambia `environment: production` por `environment: cloudflare`.

### Cómo obtener los valores

- **CLOUDFLARE_API_TOKEN:** En [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile → API Tokens → Create Token. Usa la plantilla "Edit Cloudflare Workers" o crea uno con permisos: Account → Workers Scripts → Edit, Account → Account Settings → Read.
- **CLOUDFLARE_ACCOUNT_ID:** En el Dashboard, en la barra lateral derecha (o en Workers & Pages → Overview), aparece "Account ID".

## Flujo del workflow

1. Checkout del código.
2. Instalación de dependencias (`npm ci`).
3. Build (`npm run build`).
4. Deploy con Wrangler (`wrangler deploy`).

Si algún paso falla, el deploy no se realiza y puedes ver el error en la pestaña Actions del repositorio.

## Deploy manual desde GitHub

En el repo: **Actions** → **Deploy to Cloudflare Workers** → **Run workflow** (botón). Ejecuta el mismo flujo sin hacer push.

## Deploy manual desde tu máquina

Si prefieres no usar Actions o necesitas desplegar ya sin esperar al push:

```bash
npm run build
npx wrangler deploy
```

Necesitas tener configurado Wrangler (login previo con `npx wrangler login` o variables de entorno).

## Por qué la versión en producción no se actualizaba

Si la versión desplegada (p. ej. "vcba32555") no cambiaba tras hacer push, es porque **no había ningún pipeline que desplegara al subir a GitHub**. Con este workflow, cada push a `main` genera un nuevo deploy y la versión en https://citame.click se actualiza automáticamente.

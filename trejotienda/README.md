# PlasmaStore (Vercel + MongoDB)

Este proyecto se despliega como **un solo sitio** en Vercel (Root Directory: `trejotienda`). El frontend es **Vite + React** y las rutas `/api/*` son **funciones serverless** que hablan con **MongoDB Atlas**.

## 1) MongoDB Atlas

- Crea un cluster y un usuario de base de datos.
- En **Network Access**, permite el acceso que necesites (típico en demos: `0.0.0.0/0`).
- Copia el **connection string** (SRV) y elige una base de datos (por defecto el código usa `plasmastore` si no configuras otra).

No hace falta crear colecciones a mano: la app las crea al escribir.

> `supabase-schema.sql` es legado/nombre confuso: **no aplica** si estás en modo Mongo.

## 2) Variables de entorno en Vercel (Production)

- `MONGODB_URI`
- `MONGODB_DB` (opcional; por defecto `plasmastore`)
- `APP_SESSION_SECRET` (frase larga aleatoria)
- `BOOTSTRAP_TOKEN` (secreto para crear el **primer** admin)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## 3) Bootstrap del primer admin (una sola vez)

Después del deploy, ejecuta **una vez**:

```powershell
curl.exe -i -X POST "https://TU-DOMINIO.vercel.app/api/store/bootstrap-admin" `
  -H "x-bootstrap-token: TU_BOOTSTRAP_TOKEN"
```

Luego inicia sesión en la web con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Si ya existen usuarios en `store_users`, el bootstrap responde **409** (bloqueado).

## 4) `vercel.json` (SPA + API en el mismo dominio)

El fallback a `index.html` **no debe** capturar `/api/*` (si no, verás `405`/`index.html` en POST a APIs). En este repo el patrón queda excluyendo `/api/`.

## 5) Endpoints (mismo dominio)

- `POST /api/admin/upload-tdf` (multipart, campo `tdf`)
- `GET /api/public/tournaments/recent`
- `GET /api/pending`
- `GET /api/store/products`
- `GET /api/store/carousel`
- `POST /api/store/register`
- `POST /api/store/login`
- `POST /api/store/logout`
- `GET /api/store/me`
- `POST /api/store/bootstrap-admin` (bootstrap)
- `GET/PATCH /api/store/admin/tournament-deck-overrides` (admin)

## 6) Desarrollo local

```powershell
Set-Location trejotienda
npm install
npm run dev
```

Para probar APIs localmente necesitas las mismas variables de entorno en tu entorno (por ejemplo un `.env.local` que tu tooling cargue, o exportarlas en la terminal).

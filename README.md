# Plasma Store (Next.js + Express + MongoDB)

App web con:
- **Frontend**: Next.js (App Router) + React Router para navegación interna
- **Backend**: Express montado dentro de Next vía `src/pages/api/[[...slug]].ts`
- **DB**: MongoDB (Atlas recomendado)

## Requisitos
- Node.js 18+ (recomendado 20+)
- MongoDB Atlas o Mongo local

## Setup local
1) Crear variables de entorno:

```bash
copy .env.example .env.local
```

2) Rellenar como mínimo:
- `MONGODB_URI`
- `MONGODB_DB`
- `APP_SESSION_SECRET`

3) Instalar y levantar:

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## Admin
Si necesitas crear admin (BD nueva):

```bash
npm run create-admin
```

## Deploy en Vercel
1) Importa el repo en Vercel.
2) En **Project → Settings → Environment Variables**, agrega las mismas claves que en `.env.example`.
3) Asegúrate de que en Mongo Atlas:
- El cluster no esté “Paused”
- **Network Access** permite el acceso (por ejemplo `0.0.0.0/0` o IPs de Vercel)

## Notas de estabilidad (dev)
- Si aparece `Cannot find module './682.js'` / `./819.js`, normalmente es cache `.next` corrupta o procesos duplicados.
  - Solución: matar procesos `node`, borrar `.next` y reiniciar `npm run dev`.
- Evita correr `npm run build` mientras `npm run dev` está ejecutándose (puede gatillar problemas de chunks en Windows).


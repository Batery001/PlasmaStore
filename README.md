# Plasma Store (Next.js + Express + SQLite local / Mongo opcional)

App web con:
- **Frontend**: Next.js (App Router) + React Router
- **Backend**: Express montado dentro de Next vía `src/pages/api/[[...slug]].ts`
- **DB local**: **SQLite** (`DB_DRIVER=sqlite`) → archivo `server/data/local.sqlite`
- **DB cloud (opcional)**: MongoDB Atlas con `DB_DRIVER=mongo`

## Setup local (recomendado)
1) Variables:

```bash
copy .env.example .env.local
```

Asegúrate de tener:
- `DB_DRIVER=sqlite`
- `APP_SESSION_SECRET`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` (para crear admin)

2) Instalar y crear admin:

```bash
npm install
npm run check-env
npm run create-admin
npm run dev
```

Abre `http://localhost:3000` (login admin → `/admin`).

## Mongo (opcional)
Si más adelante quieres Atlas: `DB_DRIVER=mongo` + `MONGODB_URI` + `MONGODB_DB`.

## Notas de estabilidad (dev)
- Si aparece `Cannot find module './682.js'`: mata `node`, borra `.next` y reinicia `npm run dev`.
- Evita `npm run build` mientras corre `npm run dev` en Windows.

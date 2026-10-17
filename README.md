# Plasma Store TCG

Tienda actual (no el deploy viejo de Vercel/Mongo).

- **Sitio:** https://plasmastoretcg.cl
- **Stack:** Next.js 14 + Express + **SQLite** (`server/data/local.sqlite`)
- **Pagos:** TUU Pago Online y Webpay
- **Extra:** POS web, boletas, admin, envíos

Repo: https://github.com/Batery001/PlasmaStore

## Setup local

```bash
copy .env.example .env.local
```

En `.env.local`:

- `DB_DRIVER=sqlite`
- `APP_SESSION_SECRET`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`

```bash
npm install
npm run check-env
npm run create-admin
npm run dev
```

Abre http://localhost:3000 (admin → `/admin`).

## Producción (VPS)

En el servidor: `git pull`, `npm install`, `npm run build`, `pm2 restart plasmastore`.

No subas `.env.local` ni el archivo SQLite a Git.

## Mongo (opcional)

`DB_DRIVER=mongo` + `MONGODB_URI` + `MONGODB_DB`.

## Notas de estabilidad (dev)

- Si aparece `Cannot find module './682.js'`: mata `node`, borra `.next` y reinicia `npm run dev`.
- Evita `npm run build` mientras corre `npm run dev` en Windows.

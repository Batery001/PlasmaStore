# PlasmaStore (Vercel + Supabase)

Este repo se despliega como **un solo proyecto** en Vercel (Root Directory: `trejotienda`) y usa **Supabase Postgres** para datos.

## 1) Crear Supabase (Postgres)

- Crea un proyecto en Supabase.
- En el SQL editor ejecuta `supabase-schema.sql`.
- (Opcional) crea un admin:

```sql
insert into public.store_users (email, name, role, pass_hash)
values ('admin@demo.com','admin','admin','$2a$10$REEMPLAZA_CON_HASH_BCRYPT');
```

## 2) Variables de entorno en Vercel

En el proyecto de Vercel (el de `trejotienda`) agrega:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_SESSION_SECRET` (una frase larga aleatoria)

### Bootstrap admin (para “llegar y usar”)

Agrega además:

- `BOOTSTRAP_TOKEN` (token secreto para crear el primer admin)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Luego, **una sola vez**:

```powershell
curl.exe -X POST "https://TU-DOMINIO.vercel.app/api/store/bootstrap-admin" `
  -H "x-bootstrap-token: TU_BOOTSTRAP_TOKEN"
```

Después inicia sesión en la web con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## 3) Endpoints (mismo dominio)

- `POST /api/admin/upload-tdf` (multipart, campo `tdf`)
- `GET /api/public/tournaments/recent`
- `GET /api/pending`
- `GET /api/store/products`
- `GET /api/store/carousel`
- `POST /api/store/register`
- `POST /api/store/login`
- `POST /api/store/logout`
- `GET /api/store/me`
- `GET/PATCH /api/store/admin/tournament-deck-overrides` (admin)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```

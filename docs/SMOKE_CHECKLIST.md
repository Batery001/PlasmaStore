# Checklist smoke — Plasma Store

Correr en local (sandbox) y en producción cuando haya cambios grandes.

## Auth
- [ ] Registro con RUT válido + mail de verificación llega
- [ ] Verificar correo → puede comprar
- [ ] Login / logout
- [ ] Olvidé contraseña → mail → reset

## Catálogo y carrito (invitado)
- [ ] Sin login: agregar producto al carrito desde catálogo y ficha
- [ ] Ver `/carrito` como invitado y seguir a checkout
- [ ] Buscar desde el header y desde el catálogo (`?q=`)
- [ ] Filtros: stock / ofertas / precio máx
- [ ] Login con ítems de invitado → se fusionan al carrito de la cuenta
- [ ] Evento: sin login no agrega cupo; con login sí
- [ ] Página `/ayuda` y botón WhatsApp (si hay URL en sitio)
- [ ] Cupón en checkout (Admin → Cupones)
- [ ] Producto agotado → «Avisame» (wishlist, con login)
- [ ] Perfil → Lista de deseos
- [ ] Restock (stock 0→>0) → mail de aviso
- [ ] Boleta del mail abre sin sesión (`?t=`)

## Checkout
- [ ] Pago TUU sandbox / producción (según modo Admin)
- [ ] Retorno `/tuu/return` y orden pagada
- [ ] Mail comprobante al cliente + aviso a la tienda
- [ ] Estados: En camino / Listo para retiro → mail al cliente
- [ ] Pago en tienda → orden reserved / pendiente
- [ ] Checkout usable en móvil (~360px)

## Eventos
- [ ] Solo con login + carrito
- [ ] Formulario jugador en perfil tras comprar cupo

## Admin / staff
- [ ] Productos, stock, órdenes (admin)
- [ ] Staff: POS + órdenes (sin pagos/productos)
- [ ] `npm run create-staff` crea vendedor
- [ ] Sistema de pago TUU (modo + claves)
- [ ] Correo: test SMTP
- [ ] Orden TUU: reembolso manual (marcar Reembolsado; no botón Webpay)
- [ ] Backup: descarga + `npm run backup-db`
- [ ] Singles sigue desactivado hasta aviso

## Mazos
- [ ] Crear mazo Pokémon → PDF 1 hoja Letter

## Comandos
```bash
npm test                 # unitarios
npx playwright install   # una vez
npm run dev              # en otra terminal
npm run test:e2e         # smoke Playwright
npm run backup-db        # respaldo local/VPS
```

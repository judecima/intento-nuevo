# Corte SaaS

Sistema web para gestion, optimizacion y produccion de cortes de tableros.

## Estado

Fase 1 crea la base Next.js + Supabase, Fase 2 agrega el catalogo, Fase 3 agrega proyectos, Fase 4 encapsula el motor, Fase 5 persiste optimizaciones, Fase 6 agrega pedidos, Fase 7 agrega produccion/XML y Fase 8 agrega administracion/auditoria:

- Next.js App Router con TypeScript estricto.
- Supabase Auth preparado para SSR.
- Modelo inicial multi-tenant: organizaciones, perfiles y miembros.
- Migraciones SQL con enums, funciones helper, catalogo y RLS.
- Layout base por rol.
- Selector visual de materiales en `Nuevo proyecto` y administracion de materiales.
- CRUD inicial de proyectos y piezas con versionado optimista.
- Motor de optimizacion legacy extraido y encapsulado como `optimizeProject`.
- Jobs/resultados de optimizacion con RLS y plano SVG en proyecto.
- Pedidos con snapshot inmutable, revision de vendedor, aprobacion e historial de estado.
- Cola operario, trabajos de produccion, perfiles de maquina y XML en Storage privado.
- Administracion inicial de usuarios, perfiles de maquina y auditoria.
- Hardening inicial: tests de RLS/migraciones, frontera server-only y smoke de rutas protegidas.
- E2E Playwright preparados para superficies por rol y flujo inicial de proyecto.
- Importador idempotente del catalogo legado embebido en el HTML.
- Tests de dominio iniciales.

Fase 10 recupera la experiencia interactiva del optimizador original y unifica el estilo:

- Visor de plano interactivo (`src/components/optimizer/`): SVG fiel al original (refilado, cantos, sobrantes rayados, cotas), simulacion de la secuencia de corte con play/pausa/paso/velocidad, modo diagnostico con panel de huecos, kerf y cadena de rebanadas, zoom, listado de cortes agrupado, sobrantes para stock e impresion de todas las placas.
- `buildCutPlanView` (`src/lib/optimizations/plan-view.ts`) arma el modelo serializable del plano a partir de las filas persistidas; el motor ahora guarda cantos, medidas originales y trazabilidad por pieza.
- Editor de proyecto en cliente (`src/components/projects/project-workspace.tsx`): las piezas y los parametros se editan en pantalla, se puede correr `Probar sin guardar` para ver el plano con datos todavia no persistidos, y `Guardar y optimizar` persiste todo y reoptimiza en la misma operacion.
- Importacion de piezas por listado pegado (`parsePastedProjectItems`), resuelta en el cliente antes de guardar.
- Seleccion de tablero con modal de imagenes (`src/components/materials/board-picker.tsx`), con busqueda y filtros por espesor, medida y veta resueltos en el cliente. Se usa tanto en `Nuevo proyecto` como al cambiar el tablero de un proyecto existente. La galeria de pagina completa queda para `/admin/materials`.
- Sistema visual ampliado en `globals.css` (tarjetas, botones, campos, badges, metricas, tablas) y shell con navegacion agrupada y estado activo.
- La version del proyecto sube solo cuando cambia el contenido a optimizar: los cambios de estado ya no invalidan el plano recien generado (migracion `20260813210000`, ya aplicada en el proyecto Supabase).
- Si una optimizacion falla, la pantalla del proyecto muestra el motivo guardado en el job.
- `runAndStoreOptimization` (`src/lib/optimizations/run.ts`) concentra correr y persistir el plan; se usa desde el guardado del editor para que el plano guardado nunca quede atras del proyecto.

El optimizador existente sigue intacto en `Optimizador_V10_Interactivo_Selector_Materiales_v3.html`. Los modulos CommonJS bajo `src/lib/optimizer/legacy/` se generan mecanicamente con `npm run optimizer:extract`.

Fase 11 agrega el nivel de plataforma, por encima de las organizaciones:

- Tabla `platform_admins` y helper `is_platform_admin()` con politicas RLS propias sobre organizaciones, membresias y perfiles (migracion `20260816120000`, ya aplicada).
- ABM completo en `/admin/organizations`: alta, edicion, activacion y baja de organizaciones, y alta/edicion/baja de los usuarios de cada una. Si el email todavia no existe, el alta crea el usuario con nombre y contrasena.
- El item de navegacion es exclusivo del super usuario: `getNavigationForRole(role, { platformAdmin })`.
- Super usuario inicial: `juliodecima@gmail.com`.

Fase 12 abre la puerta de cada organizacion (migracion `20260816160000`, ya aplicada):

- Ruta publica `/o/<slug>` por organizacion: ingreso y, si la organizacion lo permite, alta de clientes.
- `organizations.allow_customer_signup` controla el auto-registro y se gestiona desde el ABM, que ademas muestra la ruta de acceso de cada organizacion.
- `organization_public_info(slug)` expone solo nombre y estado a visitantes anonimos; la tabla sigue siendo visible unicamente para miembros.
- `join_organization_as_customer(slug)` suma al usuario autenticado a SI MISMO y siempre como cliente; si ya pertenece con otro rol, no lo degrada. Los roles de vendedor, operario y administrador los da de alta el super usuario.

Fase 13 permite que el super usuario opere sobre cualquier organizacion (migracion `20260816190000`, ya aplicada):

- `can_read_project` y `can_edit_project` incluyen `is_platform_admin()`, de modo que piezas, optimizaciones y pedidos quedan cubiertos sin duplicar politicas. El limite de estado (`draft`/`optimized`) sigue valiendo para todos.
- `/projects` y `/projects/new` muestran un selector de organizacion cuando el usuario es super usuario; el proyecto se crea para la organizacion elegida y su catalogo de tableros es el de esa organizacion.

## Configuracion

Crear `.env.local` a partir de `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=
SUPABASE_DB_POOLER_URL=
```

`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` y `SUPABASE_DB_POOLER_URL` son solo server/local. Nunca deben importarse desde componentes cliente.

Los E2E autenticados usan variables opcionales `E2E_ADMIN_EMAIL`, `E2E_CUSTOMER_EMAIL`, `E2E_SELLER_EMAIL`, `E2E_OPERATOR_EMAIL` y sus respectivos `*_PASSWORD`. Si no estan definidas, los tests se saltean sin fallar. Para ejecutarlos con navegador real, instalar browsers con `npx playwright install`.

## Comandos

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run security:db
npm run smoke:routes
npm run catalog:extract
npm run catalog:import
npm run optimizer:extract
```

## Base De Datos

Las migraciones viven en `supabase/migrations/`. Aplicar la migracion inicial con Supabase CLI o desde el flujo de migraciones del proyecto.

`supabase/seed.sql` crea la organizacion demo, materiales base y un proyecto demo si ya existe un admin activo. `npm run catalog:import` carga el catalogo legado completo en la organizacion `demo-corte`.

Rutas principales:

- `/projects`
- `/projects/new`
- `/projects/[projectId]`
- `/orders`
- `/sales/orders`
- `/sales/review`
- `/sales/approved`
- `/production`
- `/production/approved`
- `/production/active`
- `/production/completed`
- `/admin/users`
- `/admin/materials`
- `/admin/machines`
- `/admin/audit`

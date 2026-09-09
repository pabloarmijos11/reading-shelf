# reading-shelf — CLAUDE.md

## Qué es
App de libros con SSR: búsqueda y detalle vía **Open Library API** (páginas
públicas renderizadas en servidor para SEO real), más **Firebase Auth +
Firestore** para que cada usuario autenticado lleve su lista de lectura
(quiero leer / leyendo / leído) y sus propias estanterías/colecciones.

Objetivo del proyecto: practicar SSR, señales avanzadas (`resource()`,
`linkedSignal`), testing E2E, CI/CD y deploy real — temas que no se habían
tocado en proyectos anteriores (ver vault, sección Vault de abajo).

## Stack
Versiones reales al crear el proyecto (2026-09-09), tomadas de `package.json`
y `ng version`:

- **Angular 21.2.0** con `@angular/ssr` 21.2.7 y Express 5.1.0
- **Zoneless**: la app NO usa zone.js (no está entre las dependencias).
  La detección de cambios va por signals.
- **Tailwind CSS v4.1.12** vía `@tailwindcss/postcss` (`.postcssrc.json`)
- **Vitest 4.0.8** + jsdom 28 para unit tests; Playwright para E2E (pendiente)
- Firebase Auth (email/password) + Firestore (pendiente, fase 3)
- GitHub Actions (CI) + Vercel (CD) — pendiente, fase 6
- Node 24.14.1, npm 11.11.0, Angular CLI 21.2.7
- **Idioma del código: inglés** (variables, funciones, componentes)

Comando exacto del scaffold:
```
ng new reading-shelf --ssr --style=tailwind --routing --zoneless \
  --test-runner=vitest --ai-config=agents --interactive=false
```

## Comandos
```
npm start                        # servidor de desarrollo
npm run build                    # build de producción (browser + server)
npm test -- --watch=false        # tests unitarios (una pasada)
npm run serve:ssr:reading-shelf  # servir el build SSR ya compilado
```

## Estructura de carpetas
```
src/app/
  core/
    auth.service.ts          # Firebase Auth, patrón `ready` (de expense-tracker)
    library.service.ts       # Firestore: reading status + shelves
    auth.guard.ts
  features/
    search/                  # home + búsqueda (resource() sobre query param)
    book-detail/             # detalle de libro, SSR, linkedSignal de reading status
    library/                 # /library: lista de lectura + estanterías (protegida)
    auth/                    # login / signup
  shared/
    book-card/
e2e/                          # specs de Playwright
.github/workflows/ci.yml
```

## Fases de implementación (plan aprobado)
1. Setup — scaffold SSR, Tailwind, routing base, repo Git
2. Open Library — búsqueda + detalle con `resource()`, `book-card`, verificar
   que SSR sirve HTML con datos reales (no shell vacío)
3. Firebase — Auth (login/signup, guard, patrón `ready`), modelo de datos en
   Firestore (reading status + shelves), reglas de seguridad por dueño
   (reutilizando el patrón de expense-tracker)
4. Library — lista de lectura con `linkedSignal`, CRUD de estanterías
5. Testing — Vitest para servicios/componentes (mocks de Firebase como en
   expense-tracker) + Playwright para E2E (buscar→detalle, login, agregar a
   lista de lectura, crear estantería)
6. CI/CD — GitHub Actions (lint + build + tests como gate en PRs) + conexión
   a Vercel (preview por PR, producción en merge a `main`)
7. Deploy — variables de entorno/secrets de Firebase en Vercel, verificación
   final de SSR en producción

## Skills a consultar antes de tocar cada área
- SSR / estrategias de renderizado → `angular-developer`
  (`references/rendering-strategies.md`)
- `resource()` → `angular-developer` (`references/resource.md`)
- `linkedSignal` → `angular-developer` (`references/linked-signal.md`)
- Route guards → `angular-developer` (`references/route-guards.md`)
- Tailwind → `angular-developer` (`references/tailwind-css.md`)
- Testing unitario → `angular-developer` (`references/testing-fundamentals.md`)
- Testing E2E → `angular-developer` (`references/e2e-testing.md`,
  `references/router-testing.md`)
- Reglas de seguridad de Firestore → `firebase-firestore`
  (`references/standard/security_rules.md`)
- Deploy a Vercel → skill `deploy-to-vercel` (instalada 2026-09-09,
  `vercel-labs/agent-skills`)
- CI con GitHub Actions → sin skill; el workflow se escribe a mano

## Convenciones y reglas del proyecto
- Reglas de seguridad de Firestore: patrón cerrado por dueño (`ownerId`),
  igual que en `expense-tracker` — no reinventar el patrón desde cero.
- No usar `@angular/fire`; inyección propia de `Firestore`/`Auth` como
  tokens, igual que en los otros proyectos personales.
- Las páginas públicas (`/`, `/books/:id`) deben renderizarse en servidor de
  verdad — al terminar la fase 2, verificar con `curl` o "ver código fuente"
  que el HTML servido trae el contenido, no solo el shell de Angular.
- **`RenderMode.Server` en todas las rutas** (`app.routes.server.ts`). El
  scaffold trae `RenderMode.Prerender` para `**`, que no sirve acá: ni los
  resultados de búsqueda (dependen del query param `q`) ni las fichas de libro
  (id de una API externa) se pueden enumerar en tiempo de build. Si en el
  futuro se prerenderiza alguna ruta, será una decisión explícita.
- **No agregar `ChangeDetectionStrategy.OnPush`.** `AGENTS.md` lo pide como
  regla general de Angular, pero en una app zoneless es redundante: la
  detección de cambios ya se dispara solo por signals. El CLI tampoco lo genera.
- **Los datos se piden con `httpResource`, nunca con `fetch` a pelo.** Va por
  el `HttpClient` de Angular, y eso es lo que permite que las respuestas
  obtenidas durante el SSR viajen dentro del HTML (transfer state) y el
  navegador no las vuelva a pedir al hidratar. Con `fetch` nativo se pierde y
  todo se pide dos veces. Requiere `provideHttpClient(withFetch())`.
- **El estado de la búsqueda vive en la URL** (`?q=`), no en un signal del
  componente: es lo que hace que una búsqueda sea renderizable en servidor y
  compartible. El componente navega en el submit; el resource reacciona al
  query param, no al submit.
- **Las peticiones a Open Library se declaran en `OpenLibraryService`**, que
  devuelve resources ya construidos. Los componentes no arman URLs.
- **Las descripciones se limpian, no se renderizan.** Open Library las guarda
  en Markdown y cualquier colaborador puede editarlas: pintarlas como HTML
  obligaría a sanitizar contenido ajeno, y no compensa por un párrafo de
  prosa. `stripMarkdown()` quita la sintaxis y conserva el texto del enlace.
  Si algún día se quiere formato real, hay que sanitizar de verdad — no basta
  con `innerHTML`.
- `linkedSignal` se usa para el estado de lectura editable en la página de
  detalle: se inicializa desde un `resource()` que lee Firestore, pero el
  usuario puede pisarlo localmente sin esperar el round-trip.

### Trampas descubiertas (Angular 21)
- **`allowedHosts` decide si hay SSR o no, y falla en silencio.** El motor de
  SSR valida el header `Host` contra una lista blanca (protección anti-SSRF).
  Si el host no está permitido, Angular **no** rompe: escribe un error en la
  consola del servidor y devuelve el shell vacío renderizado en cliente. Desde
  fuera se ve un HTTP 200 perfectamente normal — por eso hay que mirar el
  `<body>`, no el status code. Configurado en `src/server.ts`, alimentado por
  `NG_ALLOWED_HOSTS`.
  - **La entrada va sin puerto**: la comparación usa el *hostname*
    (`localhost`), pero el mensaje de error cita el header completo
    (`localhost:4000`) e invita a poner el puerto, que nunca coincide.
  - Al desplegar (fase 7) hay que setear `NG_ALLOWED_HOSTS` en Vercel con el
    dominio real, o toda la app cae a client-side rendering sin avisar.
- **Cómo verificar que el SSR es real**: levantar
  `npm run serve:ssr:reading-shelf` y mirar el HTML servido. Con SSR correcto,
  `<app-root>` trae el marcado y el atributo `ng-server-context="ssr"`; sin él,
  aparece `<app-root></app-root>` vacío.

### Trampas descubiertas (fase 2)
- **`withComponentInputBinding()` escribe `undefined` cuando el query param no
  está**, pisando el valor por defecto del `input()`. En `/` sin `?q=`, eso
  hacía reventar `q().trim()` dentro del resource y la página mostraba un
  banner de error falso, con HTTP 200 y solo un rastro en el log del servidor.
  Solución: `input('', { transform: (v: string | undefined) => v ?? '' })`.
  Vale para cualquier input atado a un **query** param (los params de ruta
  obligatorios como `:id` no sufren esto).
- **`fixture.whenStable()` se cuelga con `httpResource` + `HttpTestingController`.**
  El controller deja las peticiones abiertas a propósito, así que la app nunca
  estabiliza y el test muere por timeout a los 5 s — un fallo que *parece* de
  rendimiento y en realidad es de diseño del test. En componentes que disparan
  resources hay que usar `fixture.detectChanges()`, o responder las peticiones
  con `httpMock` antes de esperar.
- **`httpResource` sigue marcado como `@experimental`** en Angular 21 (desde
  19.2). Se usa igual porque es lo que integra el HTTP stack con signals, pero
  su API puede cambiar entre versiones.
- **La API de Open Library es inconsistente en `description`**: unos works la
  devuelven como string y otros como `{ type, value }`. Verificado sobre
  registros reales (`OL45804W` string, `OL27482W` objeto). Se normaliza en
  `toBookContent()`; hay tests que cubren ambas formas.
- **Los autores no salen del work.** `/works/{id}.json` solo trae claves de
  autor (`/authors/OL26320A`), lo que obligaría a una petición por autor. Se
  evita consultando el índice de búsqueda con `q=key:/works/{id}`, que ya
  devuelve `author_name` resuelto.
- **Zoneless no lleva provider explícito.** `app.config.ts` no tiene
  `provideZonelessChangeDetection()`: en Angular 21 el flag `--zoneless` del
  scaffold basta, y la prueba de que está activo es que **`zone.js` no
  aparece en `package.json`**. No agregues el provider "por si acaso" ni
  asumas que falta algo.
- **Tailwind se configuró desde `ng new`,** con `--style=tailwind` (opción
  nueva en Angular 21). No hace falta `ng add tailwindcss` ni un
  `tailwind.config.js`: v4 se configura por `.postcssrc.json` y `styles.css`.
- **Vitest ya es el runner por defecto** de `ng new` en Angular 21; no hay
  Karma que migrar. `ng test` abre en modo watch: para una sola pasada (CI,
  verificación rápida) usar `npm test -- --watch=false`.
- `ng new` **no** dejó `skipTests: true` en `angular.json` (el problema que
  arrastra `prueba-firestore`): `ng generate` sí crea specs en este proyecto.

## Pendientes conocidos
_(vacío por ahora — se completa a medida que aparezcan)_

## Vault
El vault (`Vault Proyectos`) no tenía nada documentado sobre SSR,
`linkedSignal`, E2E, CI/CD ni deploy real antes de este proyecto (consultado
el 2026-09-09) — son conceptos nuevos que se documentarán al cerrar. Si algo
de acá contradice lo que diga el vault en el futuro, gana el vault.

---

## Reglas generales de Angular

Están en **`AGENTS.md`** (raíz del proyecto), generado por `ng new
--ai-config=agents` con las best practices de Angular 21: standalone sin
`standalone: true`, `input()`/`output()` en vez de decoradores,
`ChangeDetectionStrategy.OnPush`, control flow nativo (`@if`/`@for`),
`inject()` en vez de constructor injection, `NgOptimizedImage`, y requisitos
de accesibilidad (AXE, WCAG AA).

**No dupliques esas reglas acá**: se leen de `AGENTS.md` para que no
diverjan. Este `CLAUDE.md` cubre solo lo específico de reading-shelf.

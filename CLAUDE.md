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
npm run e2e                      # tests E2E (compila y levanta el server solo)
npm run e2e:ui                   # los mismos, en el runner interactivo
```

`npm run e2e` necesita `.env.e2e` con las credenciales de la cuenta de prueba
(ver `.env.e2e.example`) y hace `npm run build` por su cuenta: tarda unos
minutos y usa el Firebase real.

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
- Reglas de seguridad de Firestore: cerradas por dueño, pero **por ruta, no
  por campo `ownerId`** — a diferencia de `expense-tracker`. Ver "Firestore:
  modelo y reglas" más abajo.
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

### Firestore: modelo y reglas

Base **Standard**, creada el 2026-09-09. Las reglas viven en `firestore.rules`
(raíz) y **se publican a mano** pegándolas en la consola, igual que en
`expense-tracker`: no hay `firebase.json` ni CLI de Firebase en el repo. El
archivo del repo es la fuente de verdad, así que si se edita en la consola hay
que traerlo de vuelta.

- **Todo cuelga de `users/{uid}`**: `users/{uid}/books/{workId}` y
  `users/{uid}/shelves/{shelfId}`. Ningún documento guarda `ownerId` — la ruta
  ya dice de quién es, y eso reduce cada regla a `request.auth.uid == userId`,
  sin índices por dueño ni `where('ownerId','==',uid)` en las consultas.
  Se eligió sobre el patrón plano de `expense-tracker` porque la lista de
  lectura siempre se lee entera y nunca se cruza entre usuarios.
- **El id del documento de un libro es el work id de Open Library**, así que
  leer el estado de una ficha es un `getDoc` directo, sin query.
- **Las fechas las pone el servidor y la regla lo verifica.** El cliente manda
  `serverTimestamp()` y la regla exige `updatedAt == request.time`. Un
  `Date.now()` del cliente sería infalsificable de comprobar. Al leer llega un
  `Timestamp`, no un número: se normaliza con `timestampToMillis()`, que lo
  detecta por `toMillis()` en vez de importar `firebase/firestore` (que
  rompería el SSR).
- **`createdAt` es inmutable** en las estanterías: en `update` se compara
  contra `resource.data.createdAt`, no contra `request.time`, porque los
  renames y los `arrayUnion` son escrituras parciales.
- **Límite conocido: las reglas no pueden recorrer una lista.** El tamaño de
  `authors` y `bookIds` está capado, el de cada elemento no. Por eso el cliente
  trunca todo contra `LIMITS` (en `library.models.ts`) antes de escribir:
  **si cambia un límite hay que cambiarlo en los dos sitios.**
- **Los `resource()` de `LibraryService` quedan idle sin sesión** (`params`
  devuelve `undefined` cuando no hay uid), lo que además los apaga solos
  durante el SSR, donde nunca hay usuario.

### Trampas descubiertas (fase 5)

- **Un doble que solo registra llamadas no prueba una ruta.** El mock de
  `firebase/firestore` en `library.service.spec.ts` es una **base en miniatura**
  (un `Map` de rutas) en vez de una lista de `vi.fn()`: resuelve paths, ordena
  de verdad con `orderBy` y `arrayUnion` es idempotente. Solo así el test "no
  lee los libros de otro usuario" significa algo — con un espía comprobaría
  los argumentos de `collection()`, no que la ruta aísla los datos, que es
  justo lo que sustituyó al `where('ownerId','==',uid)`.
- **`vi.mock` también intercepta un `import()` dinámico**, así que el patrón de
  carga diferida de Firestore no obliga a nada especial en los tests.
- **Un test de regresión hay que verificarlo al revés.** El del bug de
  `value()` se comprobó reintroduciendo el fallo a mano (quitar los
  `hasValue()` de `book-detail.ts`): caen exactamente los 3 tests nuevos y
  ninguno de los otros 12. Un test escrito después del arreglo pasa igual con
  el bug delante si está mal apuntado.
  - Para que la regresión sea observable se provee un `ErrorHandler` falso que
    acumula lo que Angular reporta. Un `effect` que lanza **no** rompe el test
    por sí solo: el error va al `ErrorHandler`, no al runner. Sin ese doble, el
    único síntoma sería el texto congelado en el DOM.
- **`CanActivateFn` está tipado como `MaybeAsync<GuardResult>`**, así que
  `.then(...)` o `.resolves` no compilan aunque el guard sea `async`. Se
  envuelve la llamada en `Promise.resolve(...)`.
- **Un guard esperando `ready` deja una promesa que rechaza al destruir el
  TestBed.** `toObservable` completa sin emitir cuando muere el injector y
  `firstValueFrom` lanza `EmptyError`, que aparece como *unhandled rejection* y
  contamina la corrida entera (Vitest avisa de "false positive tests"). El test
  que deja al guard esperando tiene que resolverlo antes de terminar
  (`setReady.set(true)` y `await`). En la app no pasa: el injector raíz no
  muere a mitad de navegación.
- **Los botones se buscan por su texto visible o su `aria-label`, nunca por su
  clase de Tailwind.** Un `button.bg-stone-900` ata el test a una decisión
  visual y se rompe al recolorear.
- **`entryResource` recibe un `Signal<string>`, no una función** — `() => 'id'`
  no compila.

### Trampas descubiertas (fase 5, E2E)

Los E2E corren contra el **build SSR real** (`playwright.config.ts` levanta
`npm run build && npm run serve:ssr:reading-shelf`) y contra el **Firebase
real**, con una cuenta dedicada cuyas credenciales viven en `.env.e2e`
(ignorado por git; `.env.e2e.example` es la plantilla). Un solo worker, sin
paralelismo: todos los specs comparten esa única lista de lectura.

- **Una escritura optimista no está confirmada cuando la UI ya la muestra.** Si
  el test navega o recarga justo después del clic, la página se destruye y la
  petición a Firestore se cancela: el cambio se pierde y el fallo aparece
  *después*, sin relación visible con la causa. Por eso todo clic que escribe
  va envuelto en `withWrite()`.
- **No se puede esperar la escritura mirando la red.** Firestore habla por dos
  conexiones WebChannel de larga duración: `/Listen/channel` (que hace
  long-polling continuo, y que también usan las *lecturas* con `getDocs`) y
  `/Write/channel`. Un `waitForResponse` por host resuelve al instante con
  tráfico ajeno; y filtrando por `/Write/channel` tampoco funciona, porque el
  canal ya está abierto y no hay un par petición/respuesta que corresponda a
  una mutación. **La señal buena es la de la propia app**: `saving`/`busy`
  deshabilitan los controles exactamente mientras la promesa de Firestore está
  en vuelo, y esa promesa resuelve cuando el servidor confirma.
- **`/library` muestra sus estados vacíos mientras la sesión se restaura.** Los
  resources quedan *idle* sin uid, e idle no es "cargando" ni tiene datos, así
  que la página dice "Nothing here yet." / "You have no shelves yet." antes de
  saber nada. Un test que mire ahí concluye que la biblioteca está vacía cuando
  no lo está — fue exactamente el motivo de que la limpieza no borrara nada.
  `gotoLibrary()` espera primero a que el header ofrezca "My library" (señal de
  que `auth.ready()` con usuario) y después a un estado terminal.
- **Un `fill` seguido de un clic puede escribir en el vacío**: si el valor no
  llegó, `createShelf()` sale sin escribir y **sin mostrar error**. El helper
  afirma el valor del input antes de pulsar.
- **El picker de estado vive dentro de la rama del libro cargado**, así que no
  existe mientras Open Library responde. Hay que esperar el `h1` del libro
  antes de mirarlo (`gotoBook`/`reloadBook`), o el fallo dice "element not
  found" y parece que no se guardó el estado.
- **La limpieza se verifica y se reintenta.** `resetLibrary()` borra lo que ve,
  recarga y comprueba; hasta tres pasadas. Una escritura perdida dejaría al
  test siguiente creyendo que parte de cero.
- **Dos controles no pueden compartir `aria-label`.** El botón *Rename* y el
  campo de renombrar tenían los dos `Rename <estantería>`: Playwright resolvía
  al botón e intentaba escribir en él. Se corrigió en la app (el campo ahora es
  `New name for <estantería>`), no en el test — era un defecto de
  accesibilidad real.
- **Ojo con `*/` dentro de un comentario de un `tsconfig.json`.** Escribir el
  glob `**/*.spec.ts` dentro de `/* … */` cierra el comentario antes de tiempo;
  Playwright falla con `JSON5: invalid character '*'`, que no sugiere nada de
  esto. En `e2e/tsconfig.json` los comentarios van con `//`.
- Los E2E **no** los recoge Vitest: `tsconfig.spec.json` solo incluye
  `src/**/*.spec.ts`, y `e2e/` queda fuera.

### Trampas descubiertas (fase 4)

- **`resource.value()` LANZA cuando el resource está en error**; no devuelve
  `undefined`. Y un `effect` que lanza aborta el render a media pasada, con
  daño colateral: la ficha se quedaba clavada en "Loading book…" en vez de
  mostrar su mensaje de error, y encima salía un `NG0100:
  ExpressionChangedAfterItHasBeenCheckedError` que parecía un problema
  distinto. Los dos síntomas eran el mismo bug.
  - **Regla**: fuera de una rama de plantilla que ya haya comprobado el error,
    todo acceso a `value()` va precedido de `hasValue()`. Vale para `effect`,
    `computed` y `linkedSignal`.
  - Ojo con los resources **independientes**: en `book-detail` conviven
    `summary` y `content`, que son dos peticiones distintas. Que una tenga
    valor no dice nada de la otra, así que cada una necesita su propia rama de
    error en la plantilla.
  - Reproducible parcheando `window.fetch` en el navegador para rechazar las
    llamadas a Open Library — más fiable que esperar a que la API falle sola.

- **Una ruta protegida no se puede renderizar en servidor.** `/library` es la
  única excepción a `RenderMode.Server`: usa `RenderMode.Client`. El guard
  corre en el servidor, donde `AuthService` responde "ready, sin usuario"
  porque la sesión vive en el navegador, así que **redirigiría a `/login` a
  todo el mundo**, incluidos los usuarios con sesión válida. En cliente el
  guard corre donde la sesión existe. No se pierde nada: la página es privada
  y sus datos tampoco se podrían leer desde el servidor.
- **El build avisa de gRPC y es esperado.** Desde que algún componente importa
  `LibraryService`, el build del servidor incluye
  `@firebase/firestore/dist/index.node.mjs` como chunk perezoso y esbuild avisa
  de que `@grpc/grpc-js` no es ESM. **No rompe el SSR**: el chunk nunca se
  ejecuta, porque `FirestoreLoader` rechaza fuera del navegador. Lo verificado
  es que las peticiones a Open Library siguen resolviendo en servidor. El bug
  de la fase 3 era ejecutarlo, no empaquetarlo.
- **Las actualizaciones optimistas se hacen sobre `resource.value`**, que es
  escribible (`this.entries.value.set(...)`). Cambia el estado del resource a
  `'local'`. En caso de error se restaura la lista anterior, guardada antes de
  escribir. La alternativa —`reload()` tras cada escritura— costaría un
  round-trip por clic para datos que el cliente ya tiene.
- **Todo componente que inyecte `LibraryService` necesita `fakeLibrary()`** en
  sus tests, o el TestBed falla con `NG0201: No provider found for
  FIREBASE_APP` (la cadena es `LibraryService -> FirestoreLoader ->
  FIREBASE_APP`). Vive en `core/library.fake.ts`, junto a `auth.fake.ts`.
  Sus resources exponen `value` **escribible** a propósito, porque los
  componentes lo mutan localmente.

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

### Trampas descubiertas (fase 3)
- **`firebase/firestore` importado estáticamente rompe el SSR.** Al añadirlo,
  las llamadas a Open Library empezaron a fallar en el servidor con
  `status: 0` y las páginas volvieron a servirse vacías — con HTTP 200 y sin
  más rastro que una línea en el log. La causa es su build de Node, que arrastra
  gRPC e interfiere con las peticiones HTTP salientes de Angular. Aislado
  quitándolo: sin Firestore el SSR vuelve a funcionar al instante.
  - **Regla**: Firestore se carga solo con `import()` dinámico y solo en el
    navegador, vía `FirestoreLoader`. Sus funciones (`doc`, `getDoc`,
    `setDoc`, …) también salen de ese import dinámico. **Nunca** un
    `import ... from 'firebase/firestore'` a nivel de módulo.
  - No se pierde nada: la sesión vive en el navegador, así que durante el SSR
    no hay usuario y por tanto no hay datos suyos que leer.
  - Beneficio extra: sacó ~300 kB del bundle inicial (699 kB → 390 kB) y
    silenció el aviso de presupuesto excedido.
- **Auth es de navegador.** En el servidor no hay sesión posible, así que
  `AuthService` marca `ready = true` con `user = null` de inmediato; si
  esperara a `onAuthStateChanged`, el render del servidor se colgaría con un
  listener que allí no dispara nunca.
- **`vi.mock('firebase/auth')` no admite `importOriginal()`.** Cargar el módulo
  real dentro de la factory choca con `firebase.ts`, que también lo importa, y
  revienta con `Cannot access '__vi_import_1__' before initialization`. Hay que
  escribir el doble completo, solo con las funciones que la app usa.
- **`vi.mock` se eleva sobre todos los imports**, así que su factory no puede
  usar variables normales del módulo. Lo que necesite compartir con los tests
  se declara con `vi.hoisted()`.

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
- **Open Library puede agotar el tiempo de conexión durante el SSR.** Medido el
  2026-09-10 en `serve:ssr`: la primera petición a `openlibrary.org` tras
  arrancar el servidor tardó 10.7 s y falló con `status: 0` y
  `ConnectTimeoutError` (el timeout de conexión de undici son 10 s); los
  reintentos resolvieron en 4.8 s y 0.7 s. La página se sirve igualmente con
  HTTP 200, pero con el estado "Loading book…" en el HTML, que es justo lo que
  vería un crawler. No es el bug de gRPC de la fase 3 — en la misma petición la
  búsqueda sí resolvió. Queda por decidir si merece un timeout propio, un
  reintento o un texto de respaldo mejor.
- Quitar un libro de la lista de lectura **no lo saca de las estanterías**
  (sería una escritura por estantería). La página muestra esos libros con su id
  como etiqueta, al no poder resolver el título.
- El estado de lectura no se sincroniza entre pestañas ni entre la ficha y
  `/library`: cada página lee Firestore al montarse. Se resolvería con
  `onSnapshot`, que aún no se usa en ningún sitio.

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

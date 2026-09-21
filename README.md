# reading-shelf

App de libros construida con Angular (SSR). Busca libros a través de la
[Open Library API](https://openlibrary.org/developers/api) y, con una
cuenta, permite guardar tu propia lista de lectura (quiero leer / leyendo /
leído) y organizar libros en estanterías personalizadas.

**Demo: https://reading-shelf-ebon.vercel.app**

**Informe técnico:** [arquitectura, pruebas y despliegue](docs/informe-tecnico.pdf)
(PDF, septiembre 2026)

Las páginas de búsqueda y de ficha de libro son públicas y se renderizan en
servidor; la biblioteca personal pide cuenta.

## Stack

- Angular con Server-Side Rendering
- Tailwind CSS
- Firebase Authentication + Firestore
- Vitest (tests unitarios) y Playwright (tests end-to-end)
- GitHub Actions (CI) y Vercel (deploy)

## Cómo instalar y correr

```bash
npm install
npm start          # servidor de desarrollo
npm run build      # build de producción (incluye SSR)
npm test           # tests unitarios
npm run e2e        # tests end-to-end
```

### Tests end-to-end

Los E2E arrancan el build de producción con SSR y usan un navegador real, así
que necesitan un paso previo:

```bash
npx playwright install chromium   # una sola vez
cp .env.e2e.example .env.e2e      # y completar la contraseña
```

`.env.e2e` guarda las credenciales de una cuenta de prueba del proyecto de
Firebase, creada a mano en Authentication → Users. El archivo no se sube al
repositorio. La suite escribe en esa cuenta y la deja vacía al terminar.

## Integración continua

Cada pull request tiene que pasar formato, tests unitarios y un build de
producción. Los tests end-to-end corren aparte, solo cuando el cambio ya está
en `main`: usan un navegador real contra el Firebase real, así que dos
corridas a la vez se pelearían por la misma cuenta de prueba.

```bash
npm run format:check   # el mismo check que corre el CI
npm test -- --watch=false
npm run build
```

Si los tres pasan en local, el job de cada PR también pasa.

## Despliegue

La app se despliega en Vercel, pero **no en cada push**: el despliegue es el
último job del workflow y solo corre si los tests end-to-end han pasado. La
integración automática de Vercel está desactivada a propósito
(`git.deploymentEnabled: false`), porque desplegaba en paralelo al CI sin
mirarlo — y entonces el CI no era una puerta, solo un informe.

El build se hace en GitHub Actions y se sube ya construido, así que el
despliegue en sí tarda unos segundos. El último paso pide la página publicada y
falla si no viene renderizada en servidor: una app SSR rota responde igual con
HTTP 200, así que comprobar el código de estado no serviría de nada.

Producción es pública; las previews y las URLs de cada despliegue quedan detrás
del login de Vercel (*Standard Protection*). Tiene que ser así para que el SSR
sirva de algo: con producción protegida, ningún buscador llega a ver el HTML
renderizado.

## Estructura de carpetas

```
src/app/
  core/         servicios de Auth y Firestore, guards
  features/     search, book-detail, library, auth
  shared/       componentes reutilizables (ej. book-card)
e2e/            tests de Playwright
api/            la función que ejecuta el SSR en Vercel
```

## Estado

Terminado. Las siete fases previstas están completas: búsqueda y ficha de libro
renderizadas en servidor, lista de lectura y estanterías por usuario, 106 tests
unitarios, 18 end-to-end, integración continua y despliegue automatizado.

Lo que quedó sin hacer, a sabiendas:

- Quitar un libro de la lista no lo saca de las estanterías donde estuviera.
- Open Library puede tardar demasiado durante el renderizado en servidor; la
  página se sirve igual, pero en estado de carga.

## Licencia

[MIT](LICENSE).

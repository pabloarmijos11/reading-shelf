# reading-shelf

App de libros construida con Angular (SSR). Busca libros a través de la
[Open Library API](https://openlibrary.org/developers/api) y, con una
cuenta, permite guardar tu propia lista de lectura (quiero leer / leyendo /
leído) y organizar libros en estanterías personalizadas.

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

## Estructura de carpetas

```
src/app/
  core/         servicios de Auth y Firestore, guards
  features/     search, book-detail, library, auth
  shared/       componentes reutilizables (ej. book-card)
e2e/            tests de Playwright
```

## Estado

Proyecto en construcción.

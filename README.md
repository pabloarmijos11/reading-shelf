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

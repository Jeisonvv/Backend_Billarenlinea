# Blog API Guide

Esta guia documenta el modulo de blog informativo del backend. El objetivo es publicar articulos con una base solida para SEO sin depender todavia de un CMS externo.

## Modelo Post

Campos principales:

- title: titulo visible del articulo.
- slug: URL limpia y unica del post.
- excerpt: resumen corto para tarjetas y listados.
- content: texto plano o markdown del articulo. Se mantiene como fallback e indexacion.
- contentBlocks: bloques ordenados para mezclar parrafos, imagenes, videos y embeds entre el contenido.
- coverImageUrl: portada del articulo.
- galleryImages: arreglo opcional de imagenes adicionales del post.
- videoUrls: arreglo opcional de videos o embeds relacionados con el post.
- status: DRAFT o PUBLISHED.
- publishedAt: fecha de publicacion real.
- author: referencia al usuario autor.
- tags: etiquetas tematicas en minuscula.
- category: categoria principal del contenido.
- seoTitle: titulo para etiqueta title.
- seoDescription: meta description.
- canonicalUrl: URL canonica del post.
- ogImageUrl: imagen para compartir en redes.
- noIndex: evita indexacion cuando sea necesario.
- readingTime: tiempo estimado de lectura en minutos.
- relatedTournament: referencia opcional a un torneo.
- relatedEvent: referencia opcional a un evento.

## Endpoints

### Publicos

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /api/posts | Lista posts publicados |
| GET | /api/posts/:slug | Obtiene un post publicado por slug |

Filtros disponibles en GET /api/posts:

- category
- tag
- search
- page
- limit

Ejemplo:

```http
GET /api/posts?category=consejos&tag=3-bandas&search=promedio&page=1&limit=10
```

### Administracion

Requieren rol ADMIN o STAFF.

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /api/posts/admin/all | Lista posts incluyendo borradores |
| GET | /api/posts/id/:id | Obtiene un post por id |
| POST | /api/posts | Crea un post |
| PUT | /api/posts/:id | Actualiza un post |
| DELETE | /api/posts/:id | Elimina un post |

## Payload minimo recomendado

```json
{
  "title": "Como mejorar tu promedio en billar a 3 bandas",
  "excerpt": "Tres ajustes simples para mejorar tu promedio y tomar mejores decisiones en mesa.",
  "contentBlocks": [
    {
      "type": "paragraph",
      "content": "El billar a 3 bandas exige control, lectura y paciencia. En este articulo veras ajustes concretos para mejorar tu promedio."
    },
    {
      "type": "image",
      "url": "https://tusitio.com/blog/promedio-1.jpg",
      "alt": "Jugador ejecutando carambola",
      "caption": "Practica de control de salida"
    },
    {
      "type": "paragraph",
      "content": "El segundo punto clave es la velocidad. Muchos errores vienen de jugar demasiado fuerte la mesa."
    },
    {
      "type": "video",
      "url": "https://www.youtube.com/watch?v=abc123",
      "title": "Ejemplo practico de ejecucion"
    }
  ],
  "galleryImages": [
    "https://tusitio.com/blog/promedio-1.jpg",
    "https://tusitio.com/blog/promedio-2.jpg"
  ],
  "videoUrls": [
    "https://www.youtube.com/watch?v=abc123",
    "https://www.youtube.com/watch?v=def456"
  ],
  "status": "PUBLISHED",
  "category": "consejos",
  "tags": ["billar", "3 bandas", "promedio"]
}
```

Tipos soportados en contentBlocks:

- paragraph
- heading
- image
- video
- quote
- embed

## Reglas utiles

- Si no envias slug, el backend lo genera desde title.
- Puedes enviar contentBlocks sin content. El backend genera content plano a partir de los bloques para mantener busqueda y readingTime.
- Si no envias seoTitle, toma title.
- Si no envias seoDescription, toma excerpt.
- Si no envias canonicalUrl y existe FRONTEND_URL, se construye como /blog/:slug.
- Si no envias ogImageUrl, usa coverImageUrl.
- Si el post se publica y no trae publishedAt, el backend asigna la fecha actual.
- readingTime se calcula automaticamente segun el contenido.
- galleryImages y videoUrls aceptan multiples URLs para enriquecer el post sin convertir coverImageUrl u ogImageUrl en arreglos.
- Si defines YOUTUBE_CHANNEL_URL en el entorno, el backend la devuelve en meta.youtubeChannelUrl para que el frontend pueda mostrar el enlace del canal dentro del blog o del detalle del post.

## Integracion del canal de YouTube

Agrega esta variable al entorno del backend:

```dotenv
YOUTUBE_CHANNEL_URL=https://www.youtube.com/@TuCanal
```

Las respuestas del modulo de posts incluiran:

```json
{
  "meta": {
    "youtubeChannelUrl": "https://www.youtube.com/@TuCanal"
  }
}
```

Uso recomendado en frontend:

- Mostrar boton o enlace fijo de "Ver canal de YouTube" en el detalle del post.
- Mostrar CTA al final del articulo para invitar a ver transmisiones o videos.
- Reutilizar la misma URL en tarjetas del blog sin duplicarla en cada post.

## Recomendaciones SEO para frontend

- Usa seoTitle en la etiqueta title.
- Usa seoDescription como meta description.
- Usa canonicalUrl como canonical.
- Usa ogImageUrl, title y description para Open Graph.
- Genera schema Article para los posts publicados.
- Incluye los slugs publicados en tu sitemap.
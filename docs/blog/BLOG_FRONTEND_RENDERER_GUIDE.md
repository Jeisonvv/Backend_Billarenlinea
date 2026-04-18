# Blog Frontend Renderer Guide

Esta guia muestra una forma practica de renderizar `contentBlocks` desde el frontend usando React.

## Respuesta esperada del backend

Ejemplo resumido de un post:

```json
{
  "ok": true,
  "data": {
    "title": "Como mejorar tu promedio en billar a 3 bandas",
    "slug": "como-mejorar-tu-promedio-en-billar-a-3-bandas",
    "excerpt": "Tres ajustes simples para mejorar tu promedio y tomar mejores decisiones en mesa.",
    "content": "Texto plano derivado para busqueda y lectura...",
    "contentBlocks": [
      {
        "type": "heading",
        "content": "Control de velocidad",
        "level": 2
      },
      {
        "type": "paragraph",
        "content": "La velocidad es uno de los factores que mas afecta el promedio real del jugador."
      },
      {
        "type": "image",
        "url": "https://tusitio.com/blog/velocidad.jpg",
        "alt": "Jugador practicando control de velocidad",
        "caption": "Sesion de practica en mesa larga"
      },
      {
        "type": "video",
        "url": "https://www.youtube.com/watch?v=abc123",
        "title": "Ejemplo de ejecucion"
      },
      {
        "type": "quote",
        "content": "La mesa se domina con paciencia, no con fuerza."
      }
    ],
    "coverImageUrl": "https://tusitio.com/blog/portada.jpg",
    "seoTitle": "Como mejorar tu promedio en billar a 3 bandas | Billar en Linea",
    "seoDescription": "Aprende ajustes concretos para mejorar lectura, velocidad y control en 3 bandas.",
    "ogImageUrl": "https://tusitio.com/blog/og.jpg",
    "canonicalUrl": "https://tusitio.com/blog/como-mejorar-tu-promedio-en-billar-a-3-bandas"
  },
  "meta": {
    "youtubeChannelUrl": "https://www.youtube.com/@TuCanal"
  }
}
```

## Tipo recomendado en frontend

```ts
type PostContentBlock = {
  type: "paragraph" | "heading" | "image" | "video" | "quote" | "embed";
  content?: string;
  url?: string;
  alt?: string;
  caption?: string;
  title?: string;
  level?: number;
};

type BlogPost = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  contentBlocks: PostContentBlock[];
  coverImageUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  ogImageUrl?: string;
};
```

## Renderizador React

```tsx
import React from "react";

type PostContentBlock = {
  type: "paragraph" | "heading" | "image" | "video" | "quote" | "embed";
  content?: string;
  url?: string;
  alt?: string;
  caption?: string;
  title?: string;
  level?: number;
};

function getYouTubeEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

function renderBlock(block: PostContentBlock, index: number) {
  switch (block.type) {
    case "paragraph":
      return <p key={index}>{block.content}</p>;

    case "heading": {
      const level = Math.min(Math.max(block.level ?? 2, 1), 6);

      if (level === 1) return <h1 key={index}>{block.content}</h1>;
      if (level === 2) return <h2 key={index}>{block.content}</h2>;
      if (level === 3) return <h3 key={index}>{block.content}</h3>;
      if (level === 4) return <h4 key={index}>{block.content}</h4>;
      if (level === 5) return <h5 key={index}>{block.content}</h5>;
      return <h6 key={index}>{block.content}</h6>;
    }

    case "image":
      return (
        <figure key={index}>
          <img src={block.url} alt={block.alt ?? block.caption ?? "Imagen del articulo"} loading="lazy" />
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      );

    case "video": {
      if (!block.url) return null;

      const embedUrl = getYouTubeEmbedUrl(block.url);

      if (embedUrl) {
        return (
          <figure key={index}>
            <div style={{ position: "relative", paddingTop: "56.25%" }}>
              <iframe
                src={embedUrl}
                title={block.title ?? "Video del articulo"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
              />
            </div>
            {block.title ? <figcaption>{block.title}</figcaption> : null}
          </figure>
        );
      }

      return (
        <p key={index}>
          <a href={block.url} target="_blank" rel="noreferrer">
            {block.title ?? "Ver video"}
          </a>
        </p>
      );
    }

    case "quote":
      return (
        <blockquote key={index}>
          <p>{block.content}</p>
        </blockquote>
      );

    case "embed":
      return block.url ? (
        <p key={index}>
          <a href={block.url} target="_blank" rel="noreferrer">
            {block.title ?? block.url}
          </a>
        </p>
      ) : null;

    default:
      return null;
  }
}

type Props = {
  blocks: PostContentBlock[];
};

export function PostContentRenderer({ blocks }: Props) {
  return <article>{blocks.map(renderBlock)}</article>;
}
```

## Uso en una pagina de detalle

```tsx
type BlogPostPageProps = {
  post: {
    title: string;
    excerpt: string;
    coverImageUrl?: string;
    contentBlocks: PostContentBlock[];
  };
  meta?: {
    youtubeChannelUrl?: string;
  };
};

export function BlogPostPage({ post, meta }: BlogPostPageProps) {
  return (
    <main>
      <header>
        <h1>{post.title}</h1>
        <p>{post.excerpt}</p>
        {post.coverImageUrl ? <img src={post.coverImageUrl} alt={post.title} /> : null}
      </header>

      <PostContentRenderer blocks={post.contentBlocks} />

      {meta?.youtubeChannelUrl ? (
        <section>
          <h2>Mas contenido en YouTube</h2>
          <a href={meta.youtubeChannelUrl} target="_blank" rel="noreferrer">
            Ver canal de YouTube
          </a>
        </section>
      ) : null}
    </main>
  );
}
```

## SEO en frontend

Usa estos campos del backend en tu pagina:

- `seoTitle` para la etiqueta `title`
- `seoDescription` para `meta description`
- `canonicalUrl` para `link rel="canonical"`
- `ogImageUrl` para `og:image`

Ejemplo conceptual con React:

```tsx
type SeoProps = {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogImageUrl?: string;
};

export function PostSeo({ title, description, canonicalUrl, ogImageUrl }: SeoProps) {
  React.useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  return null;
}
```

Si tu frontend usa Next.js, Remix o similar, coloca esos valores en `generateMetadata`, `loader` o el sistema SEO propio del framework.

## Recomendacion practica

- Usa `contentBlocks` para el detalle del post.
- Conserva `content` como fallback si algun post viejo todavia no usa bloques.
- Usa `galleryImages` y `videoUrls` como material complementario, no como reemplazo del orden real del articulo.
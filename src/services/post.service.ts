import mongoose, { type SortOrder } from "mongoose";
import Event from "../models/event.model.js";
import Post from "../models/post.model.js";
import Tournament from "../models/tournament.model.js";
import User from "../models/user.model.js";
import { PostStatus } from "../models/enums.js";
import type { IPostContentBlock, PostContentBlockType } from "../models/post.model.js";

export interface ListPostsParams {
  category?: string;
  tag?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface ListAdminPostsParams extends ListPostsParams {
  status?: string;
}

export interface PostSiteMetadata {
  youtubeChannelUrl?: string;
}

const TEXT_BLOCK_TYPES = new Set<PostContentBlockType>(["paragraph", "heading", "quote"]);
const URL_BLOCK_TYPES = new Set<PostContentBlockType>(["image", "video", "embed"]);

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeUrlArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeContentBlocks(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as IPostContentBlock[];
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`El bloque de contenido en la posición ${index + 1} es inválido.`);
    }

    const block = item as Record<string, unknown>;
    const type = normalizeOptionalString(block.type) as PostContentBlockType | undefined;

    if (!type || !["paragraph", "heading", "image", "video", "quote", "embed"].includes(type)) {
      throw new Error(`El tipo del bloque en la posición ${index + 1} es inválido.`);
    }

    const normalizedBlock: IPostContentBlock = { type };
    const content = normalizeOptionalString(block.content);
    const url = normalizeOptionalString(block.url);
    const alt = normalizeOptionalString(block.alt);
    const caption = normalizeOptionalString(block.caption);
    const title = normalizeOptionalString(block.title);
    const level = block.level !== undefined ? Number(block.level) : undefined;

    if (TEXT_BLOCK_TYPES.has(type) && !content) {
      throw new Error(`El bloque ${type} en la posición ${index + 1} requiere content.`);
    }

    if (URL_BLOCK_TYPES.has(type) && !url) {
      throw new Error(`El bloque ${type} en la posición ${index + 1} requiere url.`);
    }

    if (type === "heading" && level !== undefined && (!Number.isInteger(level) || level < 1 || level > 6)) {
      throw new Error(`El bloque heading en la posición ${index + 1} requiere level entre 1 y 6.`);
    }

    if (content) normalizedBlock.content = content;
    if (url) normalizedBlock.url = url;
    if (alt) normalizedBlock.alt = alt;
    if (caption) normalizedBlock.caption = caption;
    if (title) normalizedBlock.title = title;
    if (type === "heading" && level !== undefined) normalizedBlock.level = level;

    return normalizedBlock;
  });
}

function extractTextFromBlocks(blocks: IPostContentBlock[]) {
  return blocks
    .map((block) => {
      if (block.content) return block.content;
      if (block.title) return block.title;
      if (block.caption) return block.caption;
      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function ensureUniqueSlug(baseSlug: string, excludeId?: string) {
  const trimmedBase = baseSlug.trim();
  const safeBase = trimmedBase || `post-${Date.now()}`;
  let candidate = safeBase;
  let counter = 2;

  while (true) {
    const existing = await Post.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: new mongoose.Types.ObjectId(excludeId) } } : {}),
    })
      .select("_id")
      .lean();

    if (!existing) {
      return candidate;
    }

    candidate = `${safeBase}-${counter}`;
    counter += 1;
  }
}

function estimateReadingTime(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function buildCanonicalUrl(slug: string, explicitCanonical?: string) {
  const normalizedExplicit = normalizeOptionalString(explicitCanonical);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  const frontend = process.env.FRONTEND_URL?.trim();
  if (!frontend) {
    return undefined;
  }

  return new URL(`/blog/${slug}`, frontend).toString();
}

function normalizePostStatus(value: unknown) {
  if (!value) {
    return PostStatus.DRAFT;
  }

  if (!Object.values(PostStatus).includes(value as PostStatus)) {
    throw new Error("Estado de publicación inválido.");
  }

  return value as PostStatus;
}

async function ensureUserExists(userId: string, message: string) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error(message);
  }

  const user = await User.findById(userId).select("_id deletedAt").lean();
  if (!user || user.deletedAt) {
    throw new Error(message);
  }

  return new mongoose.Types.ObjectId(userId);
}

async function ensureTournamentExists(id: unknown) {
  const normalized = normalizeOptionalString(id);
  if (!normalized) {
    return undefined;
  }

  if (!mongoose.Types.ObjectId.isValid(normalized)) {
    throw new Error("Torneo relacionado inválido.");
  }

  const entity = await Tournament.findById(normalized).select("_id").lean();
  if (!entity) {
    throw new Error("Torneo relacionado no encontrado.");
  }

  return new mongoose.Types.ObjectId(normalized);
}

async function ensureEventExists(id: unknown) {
  const normalized = normalizeOptionalString(id);
  if (!normalized) {
    return undefined;
  }

  if (!mongoose.Types.ObjectId.isValid(normalized)) {
    throw new Error("Evento relacionado inválido.");
  }

  const entity = await Event.findById(normalized).select("_id").lean();
  if (!entity) {
    throw new Error("Evento relacionado no encontrado.");
  }

  return new mongoose.Types.ObjectId(normalized);
}

async function buildPostPersistencePayload(data: Record<string, unknown>, creatorId: string, existingId?: string) {
  const title = normalizeOptionalString(data.title);
  const excerpt = normalizeOptionalString(data.excerpt);
  const contentInput = normalizeOptionalString(data.content);
  const contentBlocks = normalizeContentBlocks(data.contentBlocks);
  const contentFromBlocks = extractTextFromBlocks(contentBlocks);
  const content = contentInput ?? contentFromBlocks;
  const rawSlug = normalizeOptionalString(data.slug);

  if (!title) {
    throw new Error("El título del post es obligatorio.");
  }

  if (!excerpt) {
    throw new Error("El resumen corto del post es obligatorio.");
  }

  if (!content) {
    throw new Error("El contenido del post es obligatorio. Envía content o contentBlocks.");
  }

  const slug = await ensureUniqueSlug(slugify(rawSlug ?? title), existingId);
  const status = normalizePostStatus(data.status);
  const authorId = normalizeOptionalString(data.author);
  const author = await ensureUserExists(authorId ?? creatorId, "Autor no encontrado.");
  const relatedTournament = await ensureTournamentExists(data.relatedTournament);
  const relatedEvent = await ensureEventExists(data.relatedEvent);
  const publishedAtInput = data.publishedAt ? new Date(String(data.publishedAt)) : undefined;

  if (publishedAtInput && Number.isNaN(publishedAtInput.getTime())) {
    throw new Error("La fecha de publicación es inválida.");
  }

  const publishedAt = status === PostStatus.PUBLISHED
    ? (publishedAtInput ?? new Date())
    : undefined;

  const payload: Record<string, unknown> = {
    title,
    slug,
    excerpt,
    content,
    contentBlocks,
    status,
    author,
    galleryImages: normalizeUrlArray(data.galleryImages),
    videoUrls: normalizeUrlArray(data.videoUrls),
    tags: normalizeStringArray(data.tags),
    noIndex: data.noIndex === true,
    readingTime: estimateReadingTime(content),
  };

  const coverImageUrl = normalizeOptionalString(data.coverImageUrl);
  const category = normalizeOptionalString(data.category);
  const seoTitle = normalizeOptionalString(data.seoTitle) ?? title;
  const seoDescription = normalizeOptionalString(data.seoDescription) ?? excerpt;
  const canonicalUrl = buildCanonicalUrl(slug, normalizeOptionalString(data.canonicalUrl));
  const ogImageUrl = normalizeOptionalString(data.ogImageUrl) ?? coverImageUrl;

  if (coverImageUrl) payload.coverImageUrl = coverImageUrl;
  if (publishedAt) payload.publishedAt = publishedAt;
  if (category) payload.category = category;
  if (seoTitle) payload.seoTitle = seoTitle;
  if (seoDescription) payload.seoDescription = seoDescription;
  if (canonicalUrl) payload.canonicalUrl = canonicalUrl;
  if (ogImageUrl) payload.ogImageUrl = ogImageUrl;
  if (relatedTournament) payload.relatedTournament = relatedTournament;
  if (relatedEvent) payload.relatedEvent = relatedEvent;

  return payload;
}

function buildPublicListFilter(params: ListPostsParams) {
  const filter: Record<string, unknown> = {
    status: PostStatus.PUBLISHED,
  };

  if (params.category) {
    filter.category = params.category.trim().toLowerCase();
  }

  if (params.tag) {
    filter.tags = params.tag.trim().toLowerCase();
  }

  if (params.search) {
    filter.$text = { $search: params.search.trim() };
  }

  return filter;
}

function buildAdminListFilter(params: ListAdminPostsParams) {
  const filter: Record<string, unknown> = {};

  if (params.status) {
    filter.status = params.status;
  }

  if (params.category) {
    filter.category = params.category.trim().toLowerCase();
  }

  if (params.tag) {
    filter.tags = params.tag.trim().toLowerCase();
  }

  if (params.search) {
    filter.$text = { $search: params.search.trim() };
  }

  return filter;
}

function getListProjection() {
  return "title slug excerpt coverImageUrl galleryImages videoUrls status publishedAt tags category seoTitle seoDescription ogImageUrl noIndex readingTime createdAt updatedAt";
}

function getDetailQuery() {
  return Post.find()
    .populate("author", "name avatarUrl role")
    .populate("relatedTournament", "name status startDate")
    .populate("relatedEvent", "name status startDate");
}

export async function createPostService(data: Record<string, unknown>, creatorId: string) {
  const payload = await buildPostPersistencePayload(data, creatorId);
  return Post.create(payload);
}

export async function listPostsService(params: ListPostsParams) {
  const skip = (params.page - 1) * params.limit;
  const filter = buildPublicListFilter(params);
  const sort: Record<string, SortOrder | { $meta: string }> = params.search
    ? { score: { $meta: "textScore" }, publishedAt: -1 }
    : { publishedAt: -1, createdAt: -1 };
  const query = Post.find(filter)
    .select(params.search ? { score: { $meta: "textScore" }, title: 1, slug: 1, excerpt: 1, coverImageUrl: 1, status: 1, publishedAt: 1, tags: 1, category: 1, seoTitle: 1, seoDescription: 1, ogImageUrl: 1, noIndex: 1, readingTime: 1, createdAt: 1, updatedAt: 1 } : getListProjection())
    .select(params.search ? { score: { $meta: "textScore" }, title: 1, slug: 1, excerpt: 1, coverImageUrl: 1, galleryImages: 1, videoUrls: 1, status: 1, publishedAt: 1, tags: 1, category: 1, seoTitle: 1, seoDescription: 1, ogImageUrl: 1, noIndex: 1, readingTime: 1, createdAt: 1, updatedAt: 1 } : getListProjection())
    .populate("author", "name avatarUrl")
    .sort(sort)
    .skip(skip)
    .limit(params.limit)
    .lean();

  const [posts, total] = await Promise.all([
    query,
    Post.countDocuments(filter),
  ]);

  return { posts, total };
}

export async function listAdminPostsService(params: ListAdminPostsParams) {
  const skip = (params.page - 1) * params.limit;
  const filter = buildAdminListFilter(params);
  const sort: Record<string, SortOrder | { $meta: string }> = params.search
    ? { score: { $meta: "textScore" }, updatedAt: -1 }
    : { updatedAt: -1, createdAt: -1 };
  const query = Post.find(filter)
    .select(params.search ? { score: { $meta: "textScore" }, title: 1, slug: 1, excerpt: 1, coverImageUrl: 1, galleryImages: 1, videoUrls: 1, status: 1, publishedAt: 1, tags: 1, category: 1, seoTitle: 1, seoDescription: 1, ogImageUrl: 1, noIndex: 1, readingTime: 1, createdAt: 1, updatedAt: 1 } : getListProjection())
    .populate("author", "name avatarUrl role")
    .sort(sort)
    .skip(skip)
    .limit(params.limit)
    .lean();

  const [posts, total] = await Promise.all([
    query,
    Post.countDocuments(filter),
  ]);

  return { posts, total };
}

export async function getPostBySlugService(slug: string) {
  const post = await Post.findOne({ slug, status: PostStatus.PUBLISHED })
    .populate("author", "name avatarUrl role")
    .populate("relatedTournament", "name status startDate")
    .populate("relatedEvent", "name status startDate")
    .lean();

  if (!post) {
    throw new Error("Post no encontrado.");
  }

  return post;
}

export async function getPostByIdService(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Post no encontrado.");
  }

  const post = await Post.findById(id)
    .populate("author", "name avatarUrl role")
    .populate("relatedTournament", "name status startDate")
    .populate("relatedEvent", "name status startDate")
    .lean();

  if (!post) {
    throw new Error("Post no encontrado.");
  }

  return post;
}

export async function updatePostService(id: string, data: Record<string, unknown>, editorId: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Post no encontrado.");
  }

  const existing = await Post.findById(id).lean();
  if (!existing) {
    throw new Error("Post no encontrado.");
  }

  const payload = await buildPostPersistencePayload(
    {
      title: data.title ?? existing.title,
      slug: data.slug ?? existing.slug,
      excerpt: data.excerpt ?? existing.excerpt,
      content: data.content ?? existing.content,
      contentBlocks: data.contentBlocks ?? existing.contentBlocks,
      coverImageUrl: data.coverImageUrl ?? existing.coverImageUrl,
      galleryImages: data.galleryImages ?? existing.galleryImages,
      videoUrls: data.videoUrls ?? existing.videoUrls,
      status: data.status ?? existing.status,
      publishedAt: data.publishedAt ?? existing.publishedAt,
      author: data.author ?? existing.author?.toString(),
      tags: data.tags ?? existing.tags,
      category: data.category ?? existing.category,
      seoTitle: data.seoTitle ?? existing.seoTitle,
      seoDescription: data.seoDescription ?? existing.seoDescription,
      canonicalUrl: data.canonicalUrl ?? existing.canonicalUrl,
      ogImageUrl: data.ogImageUrl ?? existing.ogImageUrl,
      noIndex: data.noIndex ?? existing.noIndex,
      relatedTournament: data.relatedTournament ?? existing.relatedTournament?.toString(),
      relatedEvent: data.relatedEvent ?? existing.relatedEvent?.toString(),
    },
    editorId,
    id,
  );

  return Post.findByIdAndUpdate(
    id,
    { $set: payload },
    { new: true, runValidators: true },
  )
    .populate("author", "name avatarUrl role")
    .populate("relatedTournament", "name status startDate")
    .populate("relatedEvent", "name status startDate");
}

export async function deletePostService(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Post no encontrado.");
  }

  const post = await Post.findByIdAndDelete(id);
  if (!post) {
    throw new Error("Post no encontrado.");
  }

  return post;
}

export function getPostSiteMetadata(): PostSiteMetadata {
  const youtubeChannelUrl = process.env.YOUTUBE_CHANNEL_URL?.trim();

  return {
    ...(youtubeChannelUrl ? { youtubeChannelUrl } : {}),
  };
}
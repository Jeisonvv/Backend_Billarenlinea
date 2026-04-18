import type { Request, Response } from "express";
import {
  createPostService,
  deletePostService,
  getPostByIdService,
  getPostBySlugService,
  getPostSiteMetadata,
  listAdminPostsService,
  listPostsService,
  updatePostService,
} from "../services/post.service.js";

export async function createPost(req: Request, res: Response) {
  try {
    if (!req.user?.id) {
      res.status(401).json({ ok: false, message: "No autenticado." });
      return;
    }

    const post = await createPostService(req.body as Record<string, unknown>, req.user.id);
    res.status(201).json({ ok: true, data: post, meta: getPostSiteMetadata() });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

export async function getPosts(req: Request, res: Response) {
  try {
    const { category, tag, search, page = "1", limit = "10" } = req.query;
    const { posts, total } = await listPostsService({
      ...(typeof category === "string" && { category }),
      ...(typeof tag === "string" && { tag }),
      ...(typeof search === "string" && { search }),
      page: Number(page),
      limit: Number(limit),
    });

    res.json({
      ok: true,
      data: posts,
      pagination: { total, page: Number(page), limit: Number(limit) },
      meta: getPostSiteMetadata(),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}

export async function getAdminPosts(req: Request, res: Response) {
  try {
    const { status, category, tag, search, page = "1", limit = "20" } = req.query;
    const { posts, total } = await listAdminPostsService({
      ...(typeof status === "string" && { status }),
      ...(typeof category === "string" && { category }),
      ...(typeof tag === "string" && { tag }),
      ...(typeof search === "string" && { search }),
      page: Number(page),
      limit: Number(limit),
    });

    res.json({
      ok: true,
      data: posts,
      pagination: { total, page: Number(page), limit: Number(limit) },
      meta: getPostSiteMetadata(),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}

export async function getPostBySlug(req: Request, res: Response) {
  try {
    const post = await getPostBySlugService(req.params.slug as string);
    res.json({ ok: true, data: post, meta: getPostSiteMetadata() });
  } catch (error: any) {
    const status = error.message === "Post no encontrado." ? 404 : 500;
    res.status(status).json({ ok: false, message: error.message });
  }
}

export async function getPostById(req: Request, res: Response) {
  try {
    const post = await getPostByIdService(req.params.id as string);
    res.json({ ok: true, data: post, meta: getPostSiteMetadata() });
  } catch (error: any) {
    const status = error.message === "Post no encontrado." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

export async function updatePost(req: Request, res: Response) {
  try {
    if (!req.user?.id) {
      res.status(401).json({ ok: false, message: "No autenticado." });
      return;
    }

    const post = await updatePostService(req.params.id as string, req.body as Record<string, unknown>, req.user.id);
    res.json({ ok: true, data: post, meta: getPostSiteMetadata() });
  } catch (error: any) {
    const status = error.message === "Post no encontrado." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

export async function deletePost(req: Request, res: Response) {
  try {
    await deletePostService(req.params.id as string);
    res.json({ ok: true, message: "Post eliminado correctamente.", meta: getPostSiteMetadata() });
  } catch (error: any) {
    const status = error.message === "Post no encontrado." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}
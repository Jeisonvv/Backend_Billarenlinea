import { Router } from "express";
import {
  createPost,
  deletePost,
  getAdminPosts,
  getPostById,
  getPostBySlug,
  getPosts,
  updatePost,
} from "../controllers/post.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { UserRole } from "../models/enums.js";

const router = Router();

const adminOrStaff = [requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF)];

router.get("/", getPosts);
router.get("/admin/all", ...adminOrStaff, getAdminPosts);
router.get("/id/:id", ...adminOrStaff, getPostById);
router.get("/:slug", getPostBySlug);
router.post("/", ...adminOrStaff, createPost);
router.put("/:id", ...adminOrStaff, updatePost);
router.delete("/:id", ...adminOrStaff, deletePost);

export default router;
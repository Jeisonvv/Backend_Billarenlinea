import { Router } from "express";
import {
  createEvent,
  deleteEvent,
  getEventById,
  getEvents,
  updateEvent,
} from "../controllers/event.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { UserRole } from "../models/enums.js";

const router = Router();

const adminOrStaff = [requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF)];

router.get("/", getEvents);
router.get("/:id", getEventById);
router.post("/", ...adminOrStaff, createEvent);
router.put("/:id", ...adminOrStaff, updateEvent);
router.delete("/:id", ...adminOrStaff, deleteEvent);

export default router;
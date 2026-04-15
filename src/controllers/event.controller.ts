import type { Request, Response } from "express";
import {
  createEventService,
  deleteEventService,
  getEventByIdService,
  listEventsService,
  updateEventService,
} from "../services/event.service.js";

export async function createEvent(req: Request, res: Response) {
  try {
    if (!req.user?.id) {
      res.status(401).json({ ok: false, message: "No autenticado." });
      return;
    }

    const event = await createEventService(req.body as Record<string, unknown>, req.user.id);
    res.status(201).json({ ok: true, data: event });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

export async function getEvents(req: Request, res: Response) {
  try {
    const { status, type, tier, featured, page = "1", limit = "20" } = req.query;
    const { events, total } = await listEventsService({
      ...(typeof status === "string" && { status }),
      ...(typeof type === "string" && { type }),
      ...(typeof tier === "string" && { tier }),
      ...(featured !== undefined && { featured: String(featured) === "true" }),
      page: Number(page),
      limit: Number(limit),
    });

    res.json({ ok: true, data: events, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}

export async function getEventById(req: Request, res: Response) {
  try {
    const event = await getEventByIdService(req.params.id as string);
    res.json({ ok: true, data: event });
  } catch (error: any) {
    const status = error.message === "Evento no encontrado." ? 404 : 500;
    res.status(status).json({ ok: false, message: error.message });
  }
}

export async function updateEvent(req: Request, res: Response) {
  try {
    const event = await updateEventService(req.params.id as string, req.body as Record<string, unknown>);
    res.json({ ok: true, data: event });
  } catch (error: any) {
    const status = error.message === "Evento no encontrado." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

export async function deleteEvent(req: Request, res: Response) {
  try {
    await deleteEventService(req.params.id as string);
    res.json({ ok: true, message: "Evento eliminado correctamente." });
  } catch (error: any) {
    const status = error.message === "Evento no encontrado." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}
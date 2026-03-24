import type { Request, Response } from "express";
import {
  ensureLeadSessionService,
  getLeadSessionService,
  promoteLeadSessionService,
  updateLeadSessionDataService,
  upsertLeadSessionStateService,
} from "../services/lead-session.service.ts";

function getErrorStatus(error: any) {
  if (error?.message === "Sesión temporal no encontrada.") return 404;
  if (error?.message === "Este usuario ya existe." || error?.code === 11000) return 409;
  return 400;
}

function getChannelAndProviderId(params: Request["params"]) {
  const { channel, providerId } = params;

  if (typeof channel !== "string" || typeof providerId !== "string") {
    throw new Error("Parámetros inválidos.");
  }

  return { channel, providerId };
}

export async function ensureLeadSession(req: Request, res: Response) {
  try {
    const result = await ensureLeadSessionService(req.body);
    res.status(result.created ? 201 : 200).json({ ok: true, created: result.created, data: result.session });
  } catch (error: any) {
    res.status(getErrorStatus(error)).json({ ok: false, message: error.message });
  }
}

export async function getLeadSession(req: Request, res: Response) {
  try {
    const { channel, providerId } = getChannelAndProviderId(req.params);
    const session = await getLeadSessionService(channel, providerId);

    if (!session) {
      return res.status(404).json({ ok: false, message: "Sesión temporal no encontrada." });
    }

    return res.json({ ok: true, data: session });
  } catch (error: any) {
    return res.status(getErrorStatus(error)).json({ ok: false, message: error.message });
  }
}

export async function updateLeadSessionState(req: Request, res: Response) {
  try {
    const { channel, providerId } = getChannelAndProviderId(req.params);
    const session = await upsertLeadSessionStateService(channel, providerId, req.body);
    res.json({ ok: true, data: session });
  } catch (error: any) {
    res.status(getErrorStatus(error)).json({ ok: false, message: error.message });
  }
}

export async function updateLeadSessionData(req: Request, res: Response) {
  try {
    const { channel, providerId } = getChannelAndProviderId(req.params);
    const session = await updateLeadSessionDataService(channel, providerId, req.body);
    res.json({ ok: true, data: session });
  } catch (error: any) {
    res.status(getErrorStatus(error)).json({ ok: false, message: error.message });
  }
}

export async function promoteLeadSession(req: Request, res: Response) {
  try {
    const { channel, providerId } = getChannelAndProviderId(req.params);
    const result = await promoteLeadSessionService(channel, providerId);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(getErrorStatus(error)).json({ ok: false, message: error.message });
  }
}
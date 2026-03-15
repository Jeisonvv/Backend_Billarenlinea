import type { Request, Response } from "express";
import { createWompiCheckoutForRaffle, handleWompiWebhook } from "../services/wompi.service.ts";

export async function createWompiCheckout(req: Request, res: Response) {
  try {
    if (!req.user) {
      res.status(401).json({ ok: false, message: "No autenticado." });
      return;
    }

    const data = await createWompiCheckoutForRaffle(
      req.params.id as string,
      req.user,
      req.body as {
        userId?: string;
        numbers: Array<string | number>;
        channel?: string;
      },
    );

    res.status(201).json({ ok: true, data });
  } catch (error: any) {
    const status = error.message === "Rifa no encontrada." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

export async function handleWompiWebhookHandler(req: Request, res: Response) {
  try {
    const result = await handleWompiWebhook(req.body as Record<string, unknown>, req.headers["x-event-checksum"]);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}
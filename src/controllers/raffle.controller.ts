import type { Request, Response } from "express";
import {
  createRaffleService,
  drawRaffleService,
  getAvailableRaffleNumbersService,
  getRaffleByIdService,
  getRaffleNumbersService,
  listRafflesService,
  purchaseRaffleTicketsService,
} from "../services/raffle.service.ts";

export async function createRaffle(req: Request, res: Response) {
  try {
    if (!req.user) {
      res.status(401).json({ ok: false, message: "No autenticado." });
      return;
    }

    const raffle = await createRaffleService(req.body as Record<string, unknown>, req.user.id);
    res.status(201).json({ ok: true, data: raffle });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

export async function getRaffles(req: Request, res: Response) {
  try {
    const { status, page = "1", limit = "20" } = req.query;
    const result = await listRafflesService({
      ...(status !== undefined && { status: status as string }),
      page: Number(page),
      limit: Number(limit),
    });

    res.json({
      ok: true,
      data: result.raffles,
      pagination: {
        total: result.total,
        page: Number(page),
        limit: Number(limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}

export async function getRaffleById(req: Request, res: Response) {
  try {
    const raffle = await getRaffleByIdService(req.params.id as string);
    res.json({ ok: true, data: raffle });
  } catch (error: any) {
    const status = error.message === "Rifa no encontrada." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

export async function getRaffleNumbers(req: Request, res: Response) {
  try {
    const { status, page = "1", limit = "100" } = req.query;
    const result = await getRaffleNumbersService(req.params.id as string, {
      ...(status !== undefined && { status: status as string }),
      page: Number(page),
      limit: Number(limit),
    });
    res.json({ ok: true, data: result });
  } catch (error: any) {
    const status = error.message === "Rifa no encontrada." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

export async function getAvailableRaffleNumbers(req: Request, res: Response) {
  try {
    const result = await getAvailableRaffleNumbersService(req.params.id as string);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    const status = error.message === "Rifa no encontrada." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

export async function purchaseRaffleTickets(req: Request, res: Response) {
  try {
    if (!req.user) {
      res.status(401).json({ ok: false, message: "No autenticado." });
      return;
    }

    const ticket = await purchaseRaffleTicketsService(
      req.params.id as string,
      req.user,
      req.body as {
        userId?: string;
        numbers: Array<string | number>;
        channel?: string;
        paymentMethod?: string;
        paymentReference?: string;
        status?: string;
      },
    );

    res.status(201).json({ ok: true, data: ticket });
  } catch (error: any) {
    const status = error.message === "Rifa no encontrada." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

export async function drawRaffle(req: Request, res: Response) {
  try {
    const raffle = await drawRaffleService(req.params.id as string);
    res.json({ ok: true, message: "Sorteo ejecutado correctamente.", data: raffle });
  } catch (error: any) {
    const status = error.message === "Rifa no encontrada." ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}
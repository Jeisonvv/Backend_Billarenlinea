/**
 * controllers/tournament.controller.ts — HTTP handlers de torneos
 *
 * Responsabilidad única: procesar la petición HTTP y delegar
 * toda la lógica de negocio al tournament.service.
 *
 * Endpoints:
 *   POST /api/tournaments                              → createTournament
 *   GET  /api/tournaments                              → getTournaments
 *   GET  /api/tournaments/:id                          → getTournamentById
 *   GET  /api/tournaments/:id/registrations            → getTournamentRegistrations
 *   POST /api/tournaments/:id/register                 → registerPlayerHandler
 *   POST /api/tournaments/:id/generate-bracket         → generateBracketHandler
 *   POST /api/tournaments/:id/groups                   → createGroupsHandler
 *   POST /api/tournaments/:id/auto-groups              → autoCreateGroupsHandler
 *   POST /api/tournaments/:id/generate-bracket-from-groups → generateBracketFromGroupsHandler
 *   POST /api/tournaments/:id/notify-groups            → notifyGroupsHandler
 */
import type { Request, Response } from "express";
import {
  createTournamentService,
  listTournamentsService,
  getTournamentByIdService,
  getTournamentRegistrationsService,
  registerPlayerService,
  generateBracketService,
  createGroupsService,
  autoCreateGroupsService,
  generateBracketFromGroupsService,
  generateAdjustmentRoundService,
  getAdjustmentRoundService,
  getGroupNotificationsService,
  getGroupStandingsService,
  getBracketService,
  getTournamentResultsService,
  updateHandicapService,
  addGroupsService,
  addPlayerToGroupService,
  getPendingPaymentsService,
} from "../services/tournament.service.ts";
import type { GroupInput } from "../services/bracket.service.ts";

// ─────────────────────────────────────────────────────────────────────────────
// POST /tournaments
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function createTournament(req: Request, res: Response) {
  try {
    const tournament = await createTournamentService(req.body);
    res.status(201).json({ ok: true, data: tournament });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /tournaments  — lista paginada con filtros opcionales
// ─────────────────────────────────────────────────────────────────────────────
export async function getTournaments(req: Request, res: Response) {
  try {
    const { status, format, page = "1", limit = "20" } = req.query;
    const { tournaments, total } = await listTournamentsService({
      ...(status !== undefined && { status: status as string }),
      ...(format !== undefined && { format: format as string }),
      page:  Number(page),
      limit: Number(limit),
    });
    res.json({ ok: true, data: tournaments, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /tournaments/:id — detalle: torneo + inscripciones + grupos
// ─────────────────────────────────────────────────────────────────────────────
export async function getTournamentById(req: Request, res: Response) {
  try {
    const data = await getTournamentByIdService(req.params.id as string);
    res.json({ ok: true, data });
  } catch (error: any) {
    const status = error.message === "Torneo no encontrado." ? 404 : 500;
    res.status(status).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// POST /tournaments/:id/register
// Inscribe a un jugador. Si withHandicap=true, 'handicap' es obligatorio.
// Body: { userId, handicap?, category?, channel?, notes? }
// ─────────────────────────────────────────────────────────────────────────────
export async function registerPlayerHandler(req: Request, res: Response) {
  try {
    const { userId, handicap, category, channel, notes } = req.body as {
      userId: string;
      handicap?: number;
      category?: string;
      channel?: string;
      notes?: string;
    };
    if (!userId) return res.status(400).json({ ok: false, message: "Se requiere 'userId'." });
    const registration = await registerPlayerService(
      req.params.id as string,
      userId,
      {
        ...(handicap  !== undefined && { handicap }),
        ...(category  !== undefined && { category }),
        ...(channel   !== undefined && { channel }),
        ...(notes     !== undefined && { notes }),
      }
    );
    res.status(201).json({ ok: true, data: registration });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

// GET /tournaments/:id/registrations — lista de inscritos
// ─────────────────────────────────────────────────────────────────────────────
export async function getTournamentRegistrations(req: Request, res: Response) {
  try {
    const registrations = await getTournamentRegistrationsService(
      req.params.id as string,
      req.query.status as string | undefined
    );
    res.json({ ok: true, total: registrations.length, data: registrations });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /tournaments/:id/generate-bracket
// Genera el bracket de eliminación directa desde inscritos CONFIRMED
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBracketHandler(req: Request, res: Response) {
  try {
    const { rounds, matches } = await generateBracketService(req.params.id as string);
    res.json({ ok: true, message: "Bracket generado correctamente.", data: { totalRounds: rounds.length, totalMatches: matches.length, matches } });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /tournaments/:id/groups
// Crea grupos con distribución manual enviada en el body
// Body: { groups: [{ name, players, tableNumber?, startTime?, advanceCount? }] }
// ─────────────────────────────────────────────────────────────────────────────
export async function createGroupsHandler(req: Request, res: Response) {
  try {
    const { groups } = req.body as { groups: GroupInput[] };
    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({ ok: false, message: "Se requiere un array de grupos." });
    }
    const created = await createGroupsService(req.params.id as string, groups);
    res.status(201).json({ ok: true, message: `${created.length} grupos creados correctamente.`, data: created });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /tournaments/:id/add-groups — agrega grupos sin borrar los existentes
// ─────────────────────────────────────────────────────────────────────────────
export async function addGroupsHandler(req: Request, res: Response) {
  try {
    const { groups } = req.body as { groups: GroupInput[] };
    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      res.status(400).json({ ok: false, message: "Se requiere un array de grupos." });
      return;
    }
    const created = await addGroupsService(req.params.id as string, groups);
    res.status(201).json({
      ok: true,
      message: `${created.length} grupo(s) agregado(s) correctamente. Las inscripciones PENDING de estos jugadores fueron confirmadas.`,
      data: created,
    });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /tournaments/:id/groups/:groupId/add-player
// Agrega un jugador a un grupo existente (grupo incompleto o tardío)
// Body: { userId: string }
// ─────────────────────────────────────────────────────────────────────────────
export async function addPlayerToGroupHandler(req: Request, res: Response) {
  try {
    const { id: tournamentId, groupId } = req.params as { id: string; groupId: string };
    const { userId } = req.body as { userId?: string };

    if (!userId) {
      res.status(400).json({ ok: false, message: "Se requiere el campo 'userId'." });
      return;
    }

    const result = await addPlayerToGroupService(tournamentId, groupId, userId);
    res.status(201).json({
      ok: true,
      message: `Jugador agregado al grupo. Se crearon ${result.newMatchesCreated} partido(s) nuevo(s).`,
      data: result,
    });
  } catch (error: any) {
    const status = error.message.includes("no encontrado") || error.message.includes("no está inscrito") ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /tournaments/:id/generate-bracket-from-groups
// Genera el bracket eliminatorio con los clasificados de cada grupo
// Requiere que todos los partidos de grupos estén COMPLETED
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBracketFromGroupsHandler(req: Request, res: Response) {
  try {
    const { totalPlayers, rounds, matches } = await generateBracketFromGroupsService(req.params.id as string);
    const roundSummary = rounds.map((r) => `${r.label} (${r.players} jugadores)`).join(" → ");
    const message = `Bracket generado con ${totalPlayers} jugadores: ${roundSummary}.`;
    res.json({ ok: true, message, totalPlayers, rounds, data: { matches } });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /tournaments/:id/auto-groups
// Distribuye automáticamente los inscritos CONFIRMED en grupos.
// Body: { playersPerGroup?: 3 | 4 | 5 }  — si no se envía, usa el del torneo
// ─────────────────────────────────────────────────────────────────────────────
export async function autoCreateGroupsHandler(req: Request, res: Response) {
  try {
    const playersPerGroup = req.body.playersPerGroup !== undefined
      ? Number(req.body.playersPerGroup)
      : undefined;
    const groups = await autoCreateGroupsService(req.params.id as string, playersPerGroup);

    // Contar cuántos grupos hay por cantidad de jugadores
    const countBySize: Record<number, number> = {};
    for (const g of groups) {
      const size = (g as any).totalPlayers as number;
      countBySize[size] = (countBySize[size] ?? 0) + 1;
    }
    const sizeDetail = Object.entries(countBySize)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([size, count]) => `${count} de ${size} jugadores`)
      .join(", ");

    const message = `Se crearon ${groups.length} grupos en total: ${sizeDetail}.`;

    res.status(201).json({ ok: true, message, data: { groups } });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

export async function notifyGroupsHandler(req: Request, res: Response) {
  try {
    const notifications = await getGroupNotificationsService(req.params.id as string);
    res.json({ ok: true, message: `Notificaciones preparadas para ${notifications.length} grupos.`, data: notifications });
  } catch (error: any) {
    const status = error.message.includes("no encontrado") || error.message.includes("No hay grupos") ? 400 : 500;
    res.status(status).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /tournaments/:id/generate-adjustment-round
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GET /tournaments/:id/bracket
// ─────────────────────────────────────────────────────────────────────────────
export async function getBracketHandler(req: Request, res: Response) {
  try {
    const bracket = await getBracketService(req.params.id as string);
    if (!bracket) {
      res.status(404).json({ ok: false, message: "El bracket aún no ha sido generado para este torneo." });
      return;
    }
    res.json({ ok: true, data: bracket });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al obtener el bracket.";
    res.status(500).json({ ok: false, message: msg });
  }
}

export async function generateAdjustmentRoundHandler(req: Request, res: Response) {
  try {
    const data = await generateAdjustmentRoundService(req.params.id as string);
    res.status(201).json({ ok: true, message: data.message, data });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /tournaments/:id/adjustment-round
// ─────────────────────────────────────────────────────────────────────────────
export async function getAdjustmentRoundHandler(req: Request, res: Response) {
  try {
    const data = await getAdjustmentRoundService(req.params.id as string);
    res.json({ ok: true, data });
  } catch (error: any) {
    res.status(404).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /tournaments/:id/group-standings
// ─────────────────────────────────────────────────────────────────────────────
export async function getGroupStandingsHandler(req: Request, res: Response) {
  try {
    const { totalAdvancing, groups } = await getGroupStandingsService(req.params.id as string);
    res.json({ ok: true, totalAdvancing, data: groups });
  } catch (error: any) {
    const status = error.message.includes("no encontrado") || error.message.includes("No hay grupos") ? 400 : 500;
    res.status(status).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /tournaments/:id/results — ranking final del torneo
// ─────────────────────────────────────────────────────────────────────────────
export async function getTournamentResultsHandler(req: Request, res: Response) {
  try {
    const data = await getTournamentResultsService(req.params.id as string);
    res.json({ ok: true, data });
  } catch (error: any) {
    const status = error.message.includes("no encontrado") ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /tournaments/:id/pending-payments — jugadores sin pago confirmar
// ─────────────────────────────────────────────────────────────────────────────
export async function getPendingPaymentsHandler(req: Request, res: Response) {
  try {
    const data = await getPendingPaymentsService(req.params.id as string);
    res.json({ ok: true, data });
  } catch (error: any) {
    const status = error.message.includes("no encontrado") ? 404 : 500;
    res.status(status).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /tournaments/:id/registrations/:userId/handicap
// Body: { handicap: number }
// ─────────────────────────────────────────────────────────────────────────────
export async function updateHandicapHandler(req: Request, res: Response) {
  try {
    const { id: tournamentId, userId } = req.params as { id: string; userId: string };
    const { handicap } = req.body as { handicap: unknown };

    if (handicap === undefined || handicap === null) {
      res.status(400).json({ ok: false, message: "Se requiere el campo 'handicap'." });
      return;
    }
    const parsed = Number(handicap);
    if (!Number.isFinite(parsed) || parsed < 0) {
      res.status(400).json({ ok: false, message: "'handicap' debe ser un número positivo." });
      return;
    }

    const registration = await updateHandicapService(tournamentId, userId, parsed);
    res.json({ ok: true, message: `Handicap actualizado a ${parsed}.`, data: registration });
  } catch (error: any) {
    const status = error.message.includes("no encontrado") || error.message.includes("Inscripción no encontrada") ? 404 : 400;
    res.status(status).json({ ok: false, message: error.message });
  }
}

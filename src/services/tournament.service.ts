import mongoose from "mongoose";
import Tournament from "../models/tournament.model.ts";
import TournamentRegistration from "../models/tournament-registration.model.ts";
import TournamentGroup from "../models/tournament-group.model.ts";
import Match from "../models/match.model.ts";
import { RegistrationStatus, RoundType } from "../models/enums.ts";
import {
  generateBracket,
  createGroups,
  addGroups,
  addPlayerToGroup,
  autoCreateGroups,
  generateEliminationFromGroups,
  generateAdjustmentRound,
  type GroupInput,
} from "./bracket.service.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES DE PARÁMETROS
// ─────────────────────────────────────────────────────────────────────────────

export interface ListTournamentsParams {
  status?: string;
  format?: string;
  page: number;
  limit: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICIOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un torneo nuevo con los datos recibidos.
 */
export async function createTournamentService(data: Record<string, unknown>) {
  return Tournament.create(data);
}

/**
 * Inscribe a un jugador en un torneo.
 * Si el torneo es withHandicap: true, el handicap es obligatorio.
 */
export async function registerPlayerService(
  tournamentId: string,
  userId: string,
  data: {
    handicap?: number;
    category?: string;
    channel?: string;
    notes?: string;
  }
) {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error("Torneo no encontrado.");

  if (!tournament.withHandicap && data.handicap !== undefined) {
    throw new Error("Este torneo no usa handicap. No envíes el campo 'handicap'.");
  }

  // Si el torneo usa handicap y no se proporcionó, usar 12 por defecto
  const finalHandicap = tournament.withHandicap
    ? (data.handicap ?? 12)
    : undefined;

  // Verificar que no esté ya inscrito
  const existing = await TournamentRegistration.findOne({
    tournament: tournamentId,
    user: userId,
  });
  if (existing) throw new Error("El jugador ya está inscrito en este torneo.");

  const registration = await TournamentRegistration.create({
    tournament: tournamentId,
    user: userId,
    status: RegistrationStatus.PENDING,
    channel: data.channel ?? "WEB",
    ...(finalHandicap !== undefined && { handicap: finalHandicap }),
    ...(data.category !== undefined && { category: data.category }),
    ...(data.notes !== undefined && { notes: data.notes }),
  });

  return registration;
}

/**
 * Lista torneos con filtros opcionales y paginación.
 * Ordenados por startDate ascendente (el más próximo primero).
 */
export async function listTournamentsService(params: ListTournamentsParams) {
  const { status, format, page, limit } = params;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (format) filter.format = format;

  const skip = (page - 1) * limit;

  const [tournaments, total] = await Promise.all([
    Tournament.find(filter)
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Tournament.countDocuments(filter),
  ]);

  return { tournaments, total };
}

/**
 * Devuelve el detalle completo de un torneo:
 * datos del torneo + todas sus inscripciones + grupos actuales.
 */
export async function getTournamentByIdService(id: string) {
  const tournament = await Tournament.findById(id)
    .populate("createdBy", "name avatarUrl")
    .lean();

  if (!tournament) throw new Error("Torneo no encontrado.");

  const [registrations, groups] = await Promise.all([
    TournamentRegistration.find({ tournament: tournament._id })
      .populate("user", "name avatarUrl playerCategory")
      .lean(),
    TournamentGroup.find({ tournament: tournament._id })
      .populate("players", "name avatarUrl")
      .populate("standings.player", "name avatarUrl")
      .lean(),
  ]);

  const confirmedCount = registrations.filter(
    (r) => r.status === "CONFIRMED"
  ).length;

  return {
    ...tournament,
    registrations,
    totalRegistrations: registrations.length,
    confirmedRegistrations: confirmedCount,
    groups: groups.map((g) => ({ totalPlayers: g.players.length, ...g })),
  };
}

/**
 * Lista los inscritos a un torneo con datos del jugador.
 * Opcionalmente filtra por status (CONFIRMED, PENDING, etc.).
 */
export async function getTournamentRegistrationsService(
  tournamentId: string,
  status?: string
) {
  const filter: Record<string, unknown> = { tournament: tournamentId };
  if (status) filter.status = status;

  return TournamentRegistration.find(filter)
    .populate("user", "name phone avatarUrl playerCategory")
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Genera el bracket de eliminación directa para un torneo.
 * Devuelve los partidos creados con populate completo.
 */
export async function generateBracketService(tournamentId: string) {
  const oid = new mongoose.Types.ObjectId(tournamentId);
  const rounds = await generateBracket(oid);
  const matches = await Match.findByTournament(oid);
  return { rounds, matches };
}

/**
 * Crea grupos manualmente a partir de una distribución enviada por el cliente.
 */
export async function createGroupsService(
  tournamentId: string,
  groupsInput: GroupInput[]
) {
  const oid = new mongoose.Types.ObjectId(tournamentId);

  const parsedGroups: GroupInput[] = groupsInput.map((g) => ({
    ...g,
    players: g.players.map((p) => new mongoose.Types.ObjectId(p as unknown as string)),
  }));

  await createGroups(oid, parsedGroups);

  const groups = await TournamentGroup.find({ tournament: oid })
    .populate("players", "name avatarUrl")
    .populate("standings.player", "name avatarUrl")
    .lean();

  return groups.map((g) => ({ totalPlayers: g.players.length, ...g }));
}

/**
 * Agrega un jugador a un grupo existente (para el caso de un grupo incompleto).
 * Crea los partidos pendientes del nuevo jugador vs cada miembro del grupo.
 * Confirma la inscripción si estaba PENDING.
 */
export async function addPlayerToGroupService(
  tournamentId: string,
  groupId: string,
  userId: string
) {
  const oid     = new mongoose.Types.ObjectId(tournamentId);
  const gOid    = new mongoose.Types.ObjectId(groupId);
  const playerOid = new mongoose.Types.ObjectId(userId);

  // Debe existir una inscripción (CONFIRMED o PENDING)
  const reg = await TournamentRegistration.findOne({ tournament: oid, user: playerOid });
  if (!reg) throw new Error("El jugador no está inscrito en este torneo. Inscríbelo primero.");

  const { group, newMatches } = await addPlayerToGroup(oid, gOid, playerOid);

  const populated = await TournamentGroup.findById(group._id)
    .populate("players", "name avatarUrl")
    .populate("standings.player", "name avatarUrl")
    .lean();

  return {
    group: { totalPlayers: (populated as any).players.length, ...populated },
    newMatchesCreated: newMatches.length,
  };
}

/**
 * Agrega nuevos grupos a un torneo en curso SIN borrar los existentes.
 * Ideal para inscritos tardíos que entran después de iniciado el torneo.
 * Confirma automáticamente las inscripciones PENDING de los nuevos jugadores.
 */
export async function addGroupsService(
  tournamentId: string,
  groupsInput: GroupInput[]
) {
  const oid = new mongoose.Types.ObjectId(tournamentId);

  const tournament = await Tournament.findById(oid);
  if (!tournament) throw new Error("Torneo no encontrado.");

  const parsedGroups: GroupInput[] = groupsInput.map((g) => ({
    ...g,
    players: g.players.map((p) => new mongoose.Types.ObjectId(p as unknown as string)),
  }));

  const created = await addGroups(oid, parsedGroups);

  // Devolver sólo los grupos recién creados (populados)
  const newGroupIds = (created as any[]).map((g) => g._id);
  const groups = await TournamentGroup.find({ _id: { $in: newGroupIds } })
    .populate("players", "name avatarUrl")
    .populate("standings.player", "name avatarUrl")
    .lean();

  return groups.map((g) => ({ totalPlayers: g.players.length, ...g }));
}
export async function autoCreateGroupsService(
  tournamentId: string,
  playersPerGroup?: number
) {
  const oid = new mongoose.Types.ObjectId(tournamentId);
  await autoCreateGroups(oid, playersPerGroup);

  const groups = await TournamentGroup.find({ tournament: oid })
    .populate("players", "name avatarUrl")
    .populate("standings.player", "name avatarUrl")
    .lean();

  return groups.map((g) => ({ totalPlayers: g.players.length, ...g }));
}

/**
 * Genera el bracket eliminatorio a partir de los clasificados de grupos.
 * Requiere que todos los partidos de grupos estén completados.
 */
export async function generateBracketFromGroupsService(tournamentId: string) {
  const oid = new mongoose.Types.ObjectId(tournamentId);
  await generateEliminationFromGroups(oid);

  // Solo partidos del bracket (excluir GROUP y ADJUSTMENT)
  const bracketRoundTypes = ["ROUND_OF_128", "ROUND_OF_64", "ROUND_OF_32",
    "ROUND_OF_16", "QUARTERFINAL", "SEMIFINAL", "FINAL"];

  const matches = await Match.find({
    tournament: oid,
    roundType: { $in: bracketRoundTypes },
  })
    .populate("player1", "name avatarUrl")
    .populate("player2", "name avatarUrl")
    .populate("winner", "name avatarUrl")
    .sort({ roundOrder: 1, matchNumber: 1 })
    .lean();

  const roundSummaryMap = new Map<string, number>();
  for (const m of matches) {
    const count = roundSummaryMap.get(m.roundType) ?? 0;
    roundSummaryMap.set(m.roundType, count + 1);
  }

  // Jugadores en la primera ronda del bracket = partidos * 2
  const firstBracketRound = bracketRoundTypes.find((r) => roundSummaryMap.has(r));
  const firstRoundMatches = firstBracketRound ? roundSummaryMap.get(firstBracketRound)! : 0;
  const totalPlayers = firstRoundMatches * 2;

  const roundLabels: Record<string, string> = {
    ROUND_OF_128: "Ronda de 128", ROUND_OF_64: "Ronda de 64",
    ROUND_OF_32: "Ronda de 32",  ROUND_OF_16: "Octavos de final",
    QUARTERFINAL: "Cuartos de final", SEMIFINAL: "Semifinales", FINAL: "Final",
  };

  const rounds = [...roundSummaryMap.entries()]
    .map(([roundType, matchCount]) => ({
      roundType,
      label: roundLabels[roundType] ?? roundType,
      matches: matchCount,
      players: matchCount * 2,
    }));

  return { totalPlayers, rounds, matches };
}

/**
 * Devuelve el bracket de eliminación de un torneo (ROUND_OF_X, QF, SF, FINAL).
 * 404 si aún no se ha generado.
 */
export async function getBracketService(tournamentId: string) {
  const oid = new mongoose.Types.ObjectId(tournamentId);

  const bracketRoundTypes = ["ROUND_OF_128", "ROUND_OF_64", "ROUND_OF_32",
    "ROUND_OF_16", "QUARTERFINAL", "SEMIFINAL", "FINAL"];

  const matches = await Match.find({
    tournament: oid,
    roundType: { $in: bracketRoundTypes },
  })
    .populate("player1", "name avatarUrl")
    .populate("player2", "name avatarUrl")
    .populate("winner",  "name avatarUrl")
    .sort({ roundOrder: 1, matchNumber: 1 })
    .lean();

  if (matches.length === 0) return null;

  // Cargar estado de pago de todos los jugadores
  const registrations = await TournamentRegistration.find({ tournament: oid })
    .select("user status paidAt paymentMethod paymentReference")
    .lean();

  const paymentMap = new Map(
    registrations.map((r) => [r.user.toString(), {
      isPaid:           r.status === "CONFIRMED",
      paymentStatus:    r.status,
      ...(r.paidAt           && { paidAt:           r.paidAt }),
      ...(r.paymentMethod    && { paymentMethod:    r.paymentMethod }),
      ...(r.paymentReference && { paymentReference: r.paymentReference }),
    }])
  );

  const addPayment = (player: unknown) => {
    if (!player) return player;
    const id = (player as any)?._id?.toString();
    return { ...(player as object), payment: paymentMap.get(id) ?? { isPaid: false, paymentStatus: "PENDING" } };
  };

  // Agrupar por ronda
  const roundLabels: Record<string, string> = {
    ROUND_OF_128: "Ronda de 128", ROUND_OF_64: "Ronda de 64",
    ROUND_OF_32:  "Ronda de 32",  ROUND_OF_16: "Octavos de final",
    QUARTERFINAL: "Cuartos de final", SEMIFINAL: "Semifinales", FINAL: "Final",
  };

  const roundsMap = new Map<string, { roundType: string; label: string; roundOrder: number; matches: unknown[] }>();
  for (const m of matches) {
    if (!roundsMap.has(m.roundType)) {
      roundsMap.set(m.roundType, {
        roundType: m.roundType,
        label: roundLabels[m.roundType] ?? m.roundType,
        roundOrder: m.roundOrder,
        matches: [],
      });
    }
    roundsMap.get(m.roundType)!.matches.push({
      ...m,
      player1: addPayment(m.player1),
      player2: addPayment(m.player2),
    });
  }

  const rounds = [...roundsMap.values()].sort((a, b) => a.roundOrder - b.roundOrder);
  const totalPlayers = rounds[0]!.matches.length * 2;
  const pending = matches.filter(m => m.status === "PENDING").length;
  const completed = matches.filter(m => m.status === "COMPLETED").length;

  return { totalPlayers, totalMatches: matches.length, pending, completed, rounds };
}

/**
 * Genera la ronda de ajuste cuando los clasificados no son potencia de 2.
 * Ejemplo: 10 clasificados → 4 juegan ajuste, 6 entran directo al bracket de 8.
 */
export async function generateAdjustmentRoundService(tournamentId: string) {
  const oid = new mongoose.Types.ObjectId(tournamentId);
  return generateAdjustmentRound(oid);
}

/**
 * Prepara la información de notificación de grupos.
 * (Lista los grupos con jugadores y datos de mesa/hora para enviar por WhatsApp o email.)
 */
export async function getGroupNotificationsService(tournamentId: string) {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error("Torneo no encontrado.");

  const groups = await TournamentGroup.find({ tournament: tournament._id })
    .populate("players", "name phone")
    .lean();

  if (groups.length === 0) throw new Error("No hay grupos creados aún.");

  return groups.map((g) => ({
    group: g.name,
    tableNumber: g.tableNumber,
    startTime: g.startTime,
    players: g.players,
    standings: g.standings,
  }));
}

/**
 * Devuelve la tabla de posiciones de todos los grupos de un torneo.
 * Cada jugador en standings lleva su nombre y avatarUrl populados.
 * Los primeros `advanceCount` lugares de cada grupo se marcan con `advances: true`.
 */
export async function getGroupStandingsService(tournamentId: string) {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error("Torneo no encontrado.");

  const groups = await TournamentGroup.find({ tournament: tournament._id })
    .populate("standings.player", "name avatarUrl")
    .lean();

  if (groups.length === 0) throw new Error("No hay grupos creados aún.");

  // Cargar estado de pago de todos los jugadores del torneo
  const registrations = await TournamentRegistration.find({ tournament: tournament._id })
    .select("user status paidAt paymentMethod paymentReference")
    .lean();

  const paymentMap = new Map(
    registrations.map((r) => [r.user.toString(), {
      isPaid:           r.status === "CONFIRMED",
      paymentStatus:    r.status,
      paidAt:           r.paidAt,
      paymentMethod:    r.paymentMethod,
      paymentReference: r.paymentReference,
    }])
  );

  const sorted = groups.sort((a, b) => a.name.localeCompare(b.name));
  const totalAdvancing = sorted.reduce((sum, g) => sum + g.advanceCount, 0);

  const groupsData = sorted.map((g) => ({
    groupId: g._id,
    name: g.name,
    advanceCount: g.advanceCount,
    standings: g.standings
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
      .map((s, idx) => {
        const playerId = (s.player as any)?._id?.toString() ?? s.player.toString();
        const payment  = paymentMap.get(playerId);
        return {
          position: idx + 1,
          advances: idx < g.advanceCount,
          player:   s.player,
          played:   s.played,
          wins:     s.wins,
          losses:   s.losses,
          points:   s.points,
          payment: {
            isPaid:           payment?.isPaid          ?? false,
            paymentStatus:    payment?.paymentStatus   ?? "PENDING",
            ...(payment?.paidAt           && { paidAt:           payment.paidAt }),
            ...(payment?.paymentMethod    && { paymentMethod:    payment.paymentMethod }),
            ...(payment?.paymentReference && { paymentReference: payment.paymentReference }),
          },
        };
      }),
  }));

  return { totalAdvancing, groups: groupsData };
}

/**
 * Devuelve los partidos de la ronda de ajuste de un torneo.
 * Incluye jugadores populados y estado de cada partido.
 */
export async function getAdjustmentRoundService(tournamentId: string) {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error("Torneo no encontrado.");

  const matches = await Match.find({
    tournament: tournament._id,
    roundType: RoundType.ADJUSTMENT,
  })
    .populate("player1", "name avatarUrl")
    .populate("player2", "name avatarUrl")
    .populate("winner",  "name avatarUrl")
    .sort({ matchNumber: 1 })
    .lean();

  if (matches.length === 0) {
    throw new Error("No se ha generado la ronda de ajuste para este torneo.");
  }

  const total    = matches.length;
  const pending  = matches.filter((m) => m.status === "PENDING").length;
  const completed = matches.filter((m) => m.status === "COMPLETED").length;

  return { total, pending, completed, matches };
}

/**
 * Actualiza el handicap de un jugador en un torneo específico.
 * Valida que el torneo y la inscripción existan.
 */
export async function updateHandicapService(
  tournamentId: string,
  userId: string,
  handicap: number,
) {
  if (!Number.isFinite(handicap) || handicap < 0) {
    throw new Error("El handicap debe ser un número positivo.");
  }

  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error("Torneo no encontrado.");

  const registration = await TournamentRegistration.findOneAndUpdate(
    { tournament: tournamentId, user: userId },
    { $set: { handicap } },
    { new: true },
  ).populate("user", "name avatarUrl");

  if (!registration) {
    throw new Error("Inscripción no encontrada para este jugador en el torneo.");
  }

  return registration;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTADOS DEL TORNEO — ranking individual único de campeón al último
// ─────────────────────────────────────────────────────────────────────────────

/** Orden de rondas de bracket de menor a mayor (primera → final) */
const BRACKET_ROUND_WEIGHT: Record<string, number> = {
  ROUND_OF_128: 1,
  ROUND_OF_64:  2,
  ROUND_OF_32:  3,
  ROUND_OF_16:  4,
  QUARTERFINAL: 5,
  SEMIFINAL:    6,
  FINAL:        7,
};

const ROUND_LABELS_RESULTS: Record<string, string> = {
  FINAL:        "Final",
  SEMIFINAL:    "Semifinales",
  QUARTERFINAL: "Cuartos de Final",
  ROUND_OF_16:  "Octavos de Final",
  ROUND_OF_32:  "Ronda de 32",
  ROUND_OF_64:  "Ronda de 64",
  ROUND_OF_128: "Ronda de 128",
  ADJUSTMENT:   "Ronda de Ajuste",
  GROUP:        "Fase de Grupos",
};

/**
 * Ranking final completo del torneo:
 * - Todos los inscritos (sean 26 o los que sean)
 * - Posición ÚNICA para cada uno (sin empates)
 * - Desempate por total de carambolas anotadas en todo el torneo
 * - También muestra handicap y en qué ronda fue eliminado
 *
 * Lógica de posicionamiento:
 *   1° → ganador de la Final
 *   2° → perdedor de la Final
 *   3°, 4° → perdedores de Semis, desempatados por carambolas (más = mejor)
 *   5°…8° → perdedores de Cuartos, desempatados por carambolas
 *   … y así hasta la primera ronda del bracket
 *   Luego vienen los eliminados en Ajuste y en Grupos (desempatados por carambolas)
 *
 * Además guarda la posición final en TournamentRegistration.finalPosition.
 */
export async function getTournamentResultsService(tournamentId: string) {
  const oid = new mongoose.Types.ObjectId(tournamentId);

  const [tournament, registrations, allMatches] = await Promise.all([
    Tournament.findById(oid).select("name status prizes").lean(),
    TournamentRegistration.find({ tournament: oid })
      .populate("user", "name avatarUrl")
      .lean(),
    Match.find({ tournament: oid, status: "COMPLETED" }).lean(),
  ]);

  if (!tournament)     throw new Error("Torneo no encontrado.");
  if (!registrations.length) throw new Error("No hay jugadores inscritos en este torneo.");

  // ── 1. Mapa de handicap por jugador (desde inscripciones) ──────────────────
  const handicapByPlayer: Record<string, number> = {};
  for (const reg of registrations) {
    const userId = (reg.user as any)?._id?.toString() ?? reg.user.toString();
    if (reg.handicap && reg.handicap > 0) handicapByPlayer[userId] = reg.handicap;
  }

  // ── 2. Calcular ratio promedio y carambolas totales por jugador ────────────
  //   ratio_por_partido = score / handicap
  //   ratioPromedio = suma(ratios) / partidos_jugados
  //   Quien más cerca estuvo de su propio objetivo en promedio = mejor nivel
  type PlayerStats = { ratioSum: number; matches: number; carambolasTotales: number };
  const statsByPlayer: Record<string, PlayerStats> = {};

  const ensureStats = (id: string) => {
    if (!statsByPlayer[id]) statsByPlayer[id] = { ratioSum: 0, matches: 0, carambolasTotales: 0 };
    return statsByPlayer[id]!;
  };

  for (const m of allMatches) {
    const p1 = m.player1?.toString();
    const p2 = m.player2?.toString();

    if (p1) {
      const s = ensureStats(p1);
      const score = m.score1 ?? 0;
      const hcap  = handicapByPlayer[p1] ?? 0;
      s.carambolasTotales += score;
      s.matches += 1;
      if (hcap > 0) s.ratioSum += score / hcap;
    }
    if (p2) {
      const s = ensureStats(p2);
      const score = m.score2 ?? 0;
      const hcap  = handicapByPlayer[p2] ?? 0;
      s.carambolasTotales += score;
      s.matches += 1;
      if (hcap > 0) s.ratioSum += score / hcap;
    }
  }

  const ratioPromedioPor = (userId: string): number => {
    const s = statsByPlayer[userId];
    if (!s || s.matches === 0) return 0;
    return s.ratioSum / s.matches;
  };

  // ── 2. Determinar en qué ronda fue eliminado cada jugador ──────────────────
  // La ronda de eliminación = la ronda más alta en la que perdió
  const eliminatedInRound: Record<string, string> = {};

  const bracketRoundTypes = Object.keys(BRACKET_ROUND_WEIGHT);

  for (const m of allMatches) {
    if (!m.winner) continue;
    const winnerId = m.winner.toString();
    const p1       = m.player1?.toString();
    const p2       = m.player2?.toString();
    const loserId  = p1 === winnerId ? p2 : p1;
    if (!loserId) continue;

    const currentRound    = eliminatedInRound[loserId];
    const currentWeight   = currentRound ? (BRACKET_ROUND_WEIGHT[currentRound] ?? 0) : 0;
    const newWeight       = BRACKET_ROUND_WEIGHT[m.roundType] ?? 0;

    // Si es ronda de bracket o es peor/inicial, actualizar
    if (!currentRound || newWeight >= currentWeight) {
      eliminatedInRound[loserId] = m.roundType;
    }
  }

  // El campeón (ganador de la Final) no tiene ronda de eliminación
  const finalMatch = allMatches
    .filter((m) => m.roundType === "FINAL" && m.winner)
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))[0];

  const championId = finalMatch?.winner?.toString();
  if (championId) eliminatedInRound[championId] = "CHAMPION";

  // ── 3. Agrupar inscritos por ronda de eliminación ─────────────────────────
  type PlayerGroup = {
    userId: string;
    registration: (typeof registrations)[number];
    carambolasTotales: number;
    partidosJugados: number;
    ratioPromedio: number;     // desempate: score/handicap promedio por partido
    roundEliminated: string;
  };

  const groups: Record<string, PlayerGroup[]> = {};

  for (const reg of registrations) {
    const userId = (reg.user as any)?._id?.toString() ?? reg.user.toString();
    const round  = eliminatedInRound[userId] ?? "NO_JUGÓ";
    const stats  = statsByPlayer[userId] ?? { ratioSum: 0, matches: 0, carambolasTotales: 0 };

    if (!groups[round]) groups[round] = [];
    groups[round].push({
      userId,
      registration: reg,
      carambolasTotales: stats.carambolasTotales,
      partidosJugados:   stats.matches,
      ratioPromedio:     ratioPromedioPor(userId),
      roundEliminated:   round,
    });
  }

  // ── 4. Ordenar dentro de cada grupo por ratioPromedio (mayor = mejor nivel) ─
  //   Si dos jugadores tienen el mismo ratio, desempata por carambolas totales
  for (const key of Object.keys(groups)) {
    groups[key]!.sort((a, b) =>
      b.ratioPromedio !== a.ratioPromedio
        ? b.ratioPromedio - a.ratioPromedio
        : b.carambolasTotales - a.carambolasTotales,
    );
  }

  // ── 5. Construir lista final en orden de posición ─────────────────────────
  const roundOrder = [
    "CHAMPION",
    "FINAL",
    "SEMIFINAL",
    "QUARTERFINAL",
    "ROUND_OF_16",
    "ROUND_OF_32",
    "ROUND_OF_64",
    "ROUND_OF_128",
    "ADJUSTMENT",
    "GROUP",
    "NO_JUGÓ",
  ];

  type ResultEntry = {
    position:          number;
    player:            unknown;
    handicap?:         number;
    carambolasTotales: number;
    partidosJugados:   number;
    ratioPromedio:     number;   // score/handicap promedio — mide el nivel relativo
    eliminadoEnRonda:  string;
    eliminadoEnLabel:  string;
    prize?:            unknown;
  };

  const results: ResultEntry[] = [];
  let   pos = 1;

  for (const round of roundOrder) {
    const group = groups[round];
    if (!group?.length) continue;

    for (const p of group) {
      results.push({
        position:          pos,
        player:            p.registration.user,
        ...(p.registration.handicap !== undefined && { handicap: p.registration.handicap }),
        carambolasTotales: p.carambolasTotales,
        partidosJugados:   p.partidosJugados,
        ratioPromedio:     Math.round(p.ratioPromedio * 10000) / 10000, // 4 decimales
        eliminadoEnRonda:  round === "CHAMPION" ? "FINAL" : round,
        eliminadoEnLabel:  round === "CHAMPION" ? "Final (Campeón)" : (ROUND_LABELS_RESULTS[round] ?? round),
      });
      pos++;
    }
  }

  // ── 6. Adjuntar premios ────────────────────────────────────────────────────
  const prizes: Record<number, unknown> = {};
  for (const p of (tournament.prizes ?? [])) {
    prizes[(p as any).position] = p;
  }
  for (const r of results) {
    if (prizes[r.position]) r.prize = prizes[r.position];
  }

  // ── 7. Guardar finalPosition en cada inscripción ───────────────────────────
  const bulkOps = results.map((r) => ({
    updateOne: {
      filter: { tournament: oid, user: (r.player as any)?._id },
      update: { $set: { finalPosition: r.position } },
    },
  }));
  if (bulkOps.length) await TournamentRegistration.bulkWrite(bulkOps);

  const champion = results[0]?.player ?? null;

  return {
    tournament:    { _id: tournament._id, name: tournament.name, status: tournament.status },
    totalJugadores: results.length,
    champion,
    results,
  };
}

/**
 * Lista todos los jugadores que aún NO han pagado (status PENDING o WAITLIST).
 * Incluye en qué grupo están y cuántos partidos han jugado ya.
 */
export async function getPendingPaymentsService(tournamentId: string) {
  const oid = new mongoose.Types.ObjectId(tournamentId);

  const tournament = await Tournament.findById(oid).select("name entryFee").lean();
  if (!tournament) throw new Error("Torneo no encontrado.");

  const unpaid = await TournamentRegistration.find({
    tournament: oid,
    status: { $in: ["PENDING", "WAITLIST"] },
  })
    .populate("user", "name avatarUrl phone")
    .lean();

  if (unpaid.length === 0) return { total: 0, entryFee: (tournament as any).entryFee, pending: [] };

  // Buscar en qué grupo está cada uno
  const groups = await TournamentGroup.find({ tournament: oid })
    .select("name players")
    .lean();

  const playerGroupMap = new Map<string, string>();
  for (const g of groups) {
    for (const p of g.players) {
      playerGroupMap.set(p.toString(), g.name);
    }
  }

  // Contar partidos jugados por cada uno
  const played = await Match.aggregate([
    { $match: { tournament: oid, status: "COMPLETED", $or: [
      { player1: { $in: unpaid.map((r) => r.user) } },
      { player2: { $in: unpaid.map((r) => r.user) } },
    ]}},
    { $project: { players: ["$player1", "$player2"] } },
    { $unwind: "$players" },
    { $group: { _id: "$players", matchesPlayed: { $sum: 1 } } },
  ]);
  const playedMap = new Map(played.map((p: any) => [p._id.toString(), p.matchesPlayed]));

  const pending = unpaid.map((r) => {
    const userId = (r.user as any)?._id?.toString() ?? r.user.toString();
    return {
      player:        r.user,
      status:        r.status,
      group:         playerGroupMap.get(userId) ?? null,
      matchesPlayed: playedMap.get(userId) ?? 0,
      inscribedAt:   r.createdAt,
    };
  });

  return {
    total:     pending.length,
    entryFee:  (tournament as any).entryFee,
    pending,
  };
}

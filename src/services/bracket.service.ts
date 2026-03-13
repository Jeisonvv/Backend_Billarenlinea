/**
 * Bracket Service
 *
 * Lógica central del sistema de torneos:
 *   - generateBracket(tournamentId)  → Crea todos los partidos de eliminación
 *   - advanceWinner(matchId, ...)    → Registra resultado y avanza al ganador
 *   - createGroups(tournamentId, ..) → Crea grupos y sus partidos internos
 *   - recordGroupResult(matchId, ..) → Registra resultado de fase de grupos
 *   - generateEliminationFromGroups  → Genera bracket desde clasificados de grupos
 */

import mongoose from "mongoose";
import Match from "../models/match.model.ts";
import TournamentGroup, { type ITournamentGroupDocument } from "../models/tournament-group.model.ts";
import Tournament from "../models/tournament.model.ts";
import TournamentRegistration from "../models/tournament-registration.model.ts";
import User from "../models/user.model.ts";
import { MatchStatus, RoundType, RegistrationStatus, TournamentStatus } from "../models/enums.ts";

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES INTERNAS
// ─────────────────────────────────────────────────────────────────────────────

/** Calcula la siguiente potencia de 2 mayor o igual a n */
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Mezcla aleatoriamente un array (Fisher-Yates) */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Devuelve el tipo de ronda según su posición dentro del torneo.
 * totalRounds = log2(nextPower)
 * round = número actual (1 = primera ronda, totalRounds = final)
 */
function getRoundType(totalRounds: number, round: number): RoundType {
  const fromEnd = totalRounds - round; // 0 = final, 1 = semi, 2 = cuartos...
  switch (fromEnd) {
    case 0: return RoundType.FINAL;
    case 1: return RoundType.SEMIFINAL;
    case 2: return RoundType.QUARTERFINAL;
    case 3: return RoundType.ROUND_OF_16;
    case 4: return RoundType.ROUND_OF_32;
    case 5: return RoundType.ROUND_OF_64;
    case 6: return RoundType.ROUND_OF_128;
    default: return RoundType.ROUND_OF_128;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GENERACIÓN DE BRACKET (Eliminación directa)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateBracket
 *
 * Crea automáticamente todos los partidos del bracket de eliminación
 * directa para un torneo, basándose en sus jugadores confirmados.
 *
 * Funciona para cualquier número de jugadores:
 *   6  jugadores → nextPower = 8  → 2 BYEs → 3 rondas
 *   10 jugadores → nextPower = 16 → 6 BYEs → 4 rondas
 *   94 jugadores → nextPower = 128 → 34 BYEs → 7 rondas
 *
 * Conecta los partidos con nextMatchId para que el avance sea automático.
 */
export async function generateBracket(
  tournamentId: mongoose.Types.ObjectId,
  playerIds?: mongoose.Types.ObjectId[] // Opcional: pasar lista ya preparada (desde grupos)
): Promise<mongoose.Types.ObjectId[][]> {

  // ── 1. Obtener jugadores ────────────────────────────────────────────────────
  let players: mongoose.Types.ObjectId[];

  if (playerIds && playerIds.length > 0) {
    players = [...playerIds];
  } else {
    const registrations = await TournamentRegistration.find({
      tournament: tournamentId,
      status: RegistrationStatus.CONFIRMED,
    }).lean();

    if (registrations.length < 2) {
      throw new Error("Se necesitan al menos 2 jugadores confirmados para generar el bracket.");
    }

    players = registrations.map((r) => r.user as mongoose.Types.ObjectId);
  }

  shuffleArray(players);

  // ── 2. Parámetros del bracket ───────────────────────────────────────────────
  const n = players.length;
  const nextPower = nextPowerOf2(n);
  const byes = nextPower - n;
  const totalRounds = Math.log2(nextPower);

  // ── 3. Eliminar partidos anteriores de eliminación (mantener los de grupos) ─
  await Match.deleteMany({
    tournament: tournamentId,
    group: { $exists: false },
  });

  // ── 4. Crear todos los partidos vacíos por ronda ────────────────────────────
  // rounds[0] = primera ronda (más partidos), rounds[totalRounds-1] = final
  const rounds: mongoose.Types.ObjectId[][] = [];

  for (let roundIdx = 0; roundIdx < totalRounds; roundIdx++) {
    const round = roundIdx + 1;
    const matchesInRound = nextPower / Math.pow(2, round);
    const roundType = getRoundType(totalRounds, round);

    const matchIds: mongoose.Types.ObjectId[] = [];

    for (let matchIdx = 0; matchIdx < matchesInRound; matchIdx++) {
      const doc = await Match.create({
        tournament: tournamentId,
        roundType,
        roundOrder: round,
        matchNumber: matchIdx + 1,
        isBye: false,
        status: MatchStatus.PENDING,
      });
      matchIds.push(doc._id as mongoose.Types.ObjectId);
    }

    rounds.push(matchIds);
  }

  // ── 5. Conectar partidos con nextMatchId ────────────────────────────────────
  // Cada 2 partidos de la ronda R alimentan al partido Math.floor(i/2) de ronda R+1
  for (let roundIdx = 0; roundIdx < rounds.length - 1; roundIdx++) {
    const currentRound = rounds[roundIdx]!;
    const nextRound = rounds[roundIdx + 1]!;

    for (let i = 0; i < currentRound.length; i++) {
      const nextMatchIdx = Math.floor(i / 2);
      await Match.findByIdAndUpdate(currentRound[i], {
        nextMatchId: nextRound[nextMatchIdx],
      });
    }
  }

  // ── 6. Asignar jugadores a la primera ronda ─────────────────────────────────
  // Los primeros `byes` partidos son BYE, consumen un jugador cada uno.
  // Los demás partidos son normales y consumen dos jugadores.
  //
  // Ejemplo: 6 jugadores, 2 BYEs, round1 con 4 partidos
  //   Partido 0 (BYE): players[0]
  //   Partido 1 (BYE): players[1]
  //   Partido 2:       players[2] vs players[3]
  //   Partido 3:       players[4] vs players[5]

  const round1 = rounds[0]!;

  for (let i = 0; i < round1.length; i++) {
    const matchId = round1[i]!;

    if (i < byes) {
      // Partido BYE: solo un jugador, avanza automáticamente
      await Match.findByIdAndUpdate(matchId, {
        player1: players[i],
        isBye: true,
        winner: players[i],
        status: MatchStatus.BYE,
        completedAt: new Date(),
      });
    } else {
      // Partido normal: dos jugadores
      const offset = byes + (i - byes) * 2;
      await Match.findByIdAndUpdate(matchId, {
        player1: players[offset],
        player2: players[offset + 1],
      });
    }
  }

  // ── 7. Auto-avanzar ganadores de los BYEs ──────────────────────────────────
  for (let i = 0; i < byes; i++) {
    const byeMatch = await Match.findById(round1[i]);
    if (!byeMatch?.nextMatchId || !byeMatch.winner) continue;

    const nextMatch = await Match.findById(byeMatch.nextMatchId);
    if (!nextMatch) continue;

    if (!nextMatch.player1) {
      await Match.findByIdAndUpdate(byeMatch.nextMatchId, { player1: byeMatch.winner });
    } else {
      await Match.findByIdAndUpdate(byeMatch.nextMatchId, { player2: byeMatch.winner });
    }
  }

  // ── 8. Actualizar estado del torneo ────────────────────────────────────────
  await Tournament.findByIdAndUpdate(tournamentId, {
    status: TournamentStatus.IN_PROGRESS,
  });

  return rounds;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AVANCE AUTOMÁTICO (registrar resultado y mover ganador)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * advanceWinner
 *
 * Registra el resultado de un partido y avanza automáticamente al ganador
 * al siguiente partido del bracket.
 *
 * Si el partido es la final, marca el torneo como FINISHED.
 */
export async function advanceWinner(
  matchId: mongoose.Types.ObjectId,
  score1: number,
  score2: number
): Promise<{ match: object; champion?: object }> {

  const match = await Match.findById(matchId);
  if (!match) throw new Error("Partido no encontrado.");
  if (match.status === MatchStatus.COMPLETED) throw new Error("Este partido ya tiene un resultado registrado.");
  if (!match.player1 || !match.player2) throw new Error("El partido no tiene los dos jugadores asignados aún.");

  // Obtener torneo para saber si usa handicap
  const tournament = await Tournament.findById(match.tournament).lean();
  if (!tournament) throw new Error("Torneo no encontrado.");

  // Obtener handicaps de las inscripciones (siempre, para decidir si aplica)
  const [reg1, reg2] = await Promise.all([
    TournamentRegistration.findOne({ tournament: match.tournament, user: match.player1 }).select("handicap").lean(),
    TournamentRegistration.findOne({ tournament: match.tournament, user: match.player2 }).select("handicap").lean(),
  ]);
  const h1 = reg1?.handicap;
  const h2 = reg2?.handicap;

  // Usar handicap si el torneo lo indica O si ambos jugadores tienen handicap asignado
  const useHandicap = tournament.withHandicap || (h1 !== undefined && h1 > 0 && h2 !== undefined && h2 > 0);

  let p1Wins: boolean;
  if (useHandicap) {
    if (h1 === undefined || h1 === 0 || h2 === undefined || h2 === 0) {
      throw new Error("Este torneo usa handicap pero uno o ambos jugadores no tienen handicap asignado.");
    }
    const ratio1 = score1 / h1;
    const ratio2 = score2 / h2;
    if (ratio1 === ratio2) throw new Error("No puede haber empate. Un jugador debe ganar.");
    p1Wins = ratio1 > ratio2;

    console.log("─── CÁLCULO CON HANDICAP ───────────────────────────────");
    console.log(`  Player1: ${String(match.player1)}`);
    console.log(`    carambolas: ${score1}  |  handicap: ${h1}  |  ratio: ${ratio1.toFixed(4)}`);
    console.log(`  Player2: ${String(match.player2)}`);
    console.log(`    carambolas: ${score2}  |  handicap: ${h2}  |  ratio: ${ratio2.toFixed(4)}`);
    console.log(`  GANADOR: ${p1Wins ? "Player1" : "Player2"} (ratio ${p1Wins ? ratio1.toFixed(4) : ratio2.toFixed(4)} > ${p1Wins ? ratio2.toFixed(4) : ratio1.toFixed(4)})`);
    console.log("────────────────────────────────────────────────────────");
  } else {
    // Sin handicap: ganador por marcador directo
    if (score1 === score2) throw new Error("No puede haber empate. Un jugador debe ganar.");
    p1Wins = score1 > score2;

    console.log("─── CÁLCULO SIN HANDICAP ───────────────────────────────");
    console.log(`  Player1: ${String(match.player1)}  |  carambolas: ${score1}`);
    console.log(`  Player2: ${String(match.player2)}  |  carambolas: ${score2}`);
    console.log(`  GANADOR: ${p1Wins ? "Player1" : "Player2"} (${p1Wins ? score1 : score2} > ${p1Wins ? score2 : score1})`);
    console.log("────────────────────────────────────────────────────────");
  }

  const winner = p1Wins ? match.player1 : match.player2;

  // Actualizar el partido con el resultado
  await Match.findByIdAndUpdate(matchId, {
    score1,
    score2,
    winner,
    status: MatchStatus.COMPLETED,
    completedAt: new Date(),
  });

  let champion: { winner: mongoose.Types.ObjectId; tournament: mongoose.Types.ObjectId } | undefined;

  if (match.nextMatchId) {
    // Avanzar ganador al siguiente partido
    const nextMatch = await Match.findById(match.nextMatchId);
    if (nextMatch) {
      if (!nextMatch.player1) {
        await Match.findByIdAndUpdate(match.nextMatchId, { player1: winner });
      } else {
        await Match.findByIdAndUpdate(match.nextMatchId, { player2: winner });
      }
    }
  } else {
    // Este partido era la final → registrar el campeón
    await Tournament.findByIdAndUpdate(match.tournament, {
      status: TournamentStatus.FINISHED,
    });

    // Actualizar la inscripción con la posición final del campeón
    await TournamentRegistration.findOneAndUpdate(
      { tournament: match.tournament, user: winner },
      { finalPosition: 1 }
    );

    champion = { winner, tournament: match.tournament as mongoose.Types.ObjectId };
  }

  const matchResult = { matchId, score1, score2, winner };

  // Spread condicional: solo incluye `champion` cuando existe para
  // satisfacer exactOptionalPropertyTypes (undefined !== ausente)
  return champion
    ? { match: matchResult, champion }
    : { match: matchResult };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GESTIÓN DE GRUPOS (fase de grupos)
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupInput {
  name: string;                          // "A", "B", "C"...
  players: mongoose.Types.ObjectId[];    // IDs de jugadores
  tableNumber?: number;
  startTime?: Date;
  advanceCount?: number;                 // Cuántos clasifican al bracket (default 2)
}

/**
 * createGroups
 *
 * Recibe la distribución de grupos desde el frontend y:
 *   1. Crea los documentos TournamentGroup en la BD
 *   2. Genera automáticamente todos los partidos round-robin del grupo
 *      (cada jugador se enfrenta a todos los demás del mismo grupo)
 *
 * Ejemplo: Grupo A con 4 jugadores → 6 partidos (4*3/2 = 6)
 */
export async function createGroups(
  tournamentId: mongoose.Types.ObjectId,
  groupsInput: GroupInput[]
): Promise<object[]> {

  // Limpiar grupos y partidos de grupos anteriores
  const existingGroups = await TournamentGroup.find({ tournament: tournamentId });
  const groupIds = existingGroups.map((g) => g._id);
  await Match.deleteMany({ group: { $in: groupIds } });
  await TournamentGroup.deleteMany({ tournament: tournamentId });

  const createdGroups: ITournamentGroupDocument[] = [];

  for (const input of groupsInput) {
    // Traer handicaps de las inscripciones confirmadas de este grupo
    const registrationDocs = await TournamentRegistration.find({
      tournament: tournamentId,
      user: { $in: input.players },
    }).select("user handicap").lean();

    const handicapMap = new Map(
      registrationDocs.map((r) => [r.user.toString(), r.handicap])
    );

    // Standings iniciales (todos en cero, con handicap si existe)
    const standings = input.players.map((playerId) => ({
      player: playerId,
      played: 0,
      wins: 0,
      losses: 0,
      points: 0,
      ...(handicapMap.get(playerId.toString()) !== undefined && {
        handicap: handicapMap.get(playerId.toString()) as number,
      }),
    }));

    const group = await TournamentGroup.create({
      tournament: tournamentId,
      name: input.name.toUpperCase(),
      players: input.players,
      standings,
      advanceCount: input.advanceCount ?? 2,
      ...(input.tableNumber !== undefined && { tableNumber: input.tableNumber }),
      ...(input.startTime !== undefined  && { startTime:   input.startTime }),
    });

    // Generar partidos round-robin dentro del grupo
    // Cada par (i, j) con i < j forma un partido
    let matchNumber = 1;
    for (let i = 0; i < input.players.length; i++) {
      for (let j = i + 1; j < input.players.length; j++) {
        const p1 = input.players[i]!;
        const p2 = input.players[j]!;
        await Match.create({
          tournament: tournamentId,
          group: group._id,
          roundType: RoundType.GROUP,
          roundOrder: 1,
          matchNumber: matchNumber++,
          player1: p1,
          player2: p2,
          isBye: false,
          status: MatchStatus.PENDING,
        });
      }
    }

    createdGroups.push(group);
  }

  return createdGroups;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3c. AGREGAR GRUPOS (torneo en curso — sin borrar los ya existentes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * addGroups
 *
 * Igual que createGroups pero SIN borrar los grupos existentes.
 * Útil para agregar nuevos inscritos después de que el torneo ya empezó.
 *
 * Valida:
 *   - Que el nombre del grupo no exista ya en el torneo
 *   - Que ningún jugador ya esté en otro grupo del mismo torneo
 *
 * Además, confirma automáticamente las inscripciones PENDING de los
 * jugadores que se incluyen en los nuevos grupos.
 */
export async function addGroups(
  tournamentId: mongoose.Types.ObjectId,
  groupsInput: GroupInput[]
): Promise<object[]> {

  // Nombres de grupos ya existentes (en mayúsculas)
  const existingGroups = await TournamentGroup.find({ tournament: tournamentId }).lean();
  const existingNames  = new Set(existingGroups.map((g) => g.name.toUpperCase()));

  // Jugadores que ya están asignados a algún grupo
  const existingPlayerIds = new Set(
    existingGroups.flatMap((g) => g.players.map((p) => p.toString()))
  );

  // Validar antes de crear nada
  for (const input of groupsInput) {
    const name = input.name.toUpperCase();
    if (existingNames.has(name)) {
      throw new Error(`Ya existe un grupo con el nombre "${name}". Usa un nombre diferente.`);
    }
    for (const pid of input.players) {
      if (existingPlayerIds.has(pid.toString())) {
        throw new Error(`El jugador ${pid} ya pertenece a otro grupo de este torneo.`);
      }
    }
  }

  // Auto-confirmar inscripciones PENDING de los jugadores nuevos
  const allNewPlayerIds = groupsInput.flatMap((g) => g.players);
  await TournamentRegistration.updateMany(
    { tournament: tournamentId, user: { $in: allNewPlayerIds }, status: "PENDING" },
    { $set: { status: RegistrationStatus.CONFIRMED } }
  );

  const createdGroups: ITournamentGroupDocument[] = [];

  for (const input of groupsInput) {
    const registrationDocs = await TournamentRegistration.find({
      tournament: tournamentId,
      user: { $in: input.players },
    }).select("user handicap").lean();

    const handicapMap = new Map(
      registrationDocs.map((r) => [r.user.toString(), r.handicap])
    );

    const standings = input.players.map((playerId) => ({
      player: playerId,
      played: 0,
      wins: 0,
      losses: 0,
      points: 0,
      ...(handicapMap.get(playerId.toString()) !== undefined && {
        handicap: handicapMap.get(playerId.toString()) as number,
      }),
    }));

    const group = await TournamentGroup.create({
      tournament: tournamentId,
      name: input.name.toUpperCase(),
      players: input.players,
      standings,
      advanceCount: input.advanceCount ?? 2,
      ...(input.tableNumber !== undefined && { tableNumber: input.tableNumber }),
      ...(input.startTime   !== undefined && { startTime:   input.startTime }),
    });

    let matchNumber = 1;
    for (let i = 0; i < input.players.length; i++) {
      for (let j = i + 1; j < input.players.length; j++) {
        await Match.create({
          tournament: tournamentId,
          group: group._id,
          roundType: RoundType.GROUP,
          roundOrder: 1,
          matchNumber: matchNumber++,
          player1: input.players[i]!,
          player2: input.players[j]!,
          isBye: false,
          status: MatchStatus.PENDING,
        });
      }
    }

    createdGroups.push(group);
  }

  return createdGroups;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3d. AGREGAR JUGADOR A UN GRUPO EXISTENTE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * addPlayerToGroup
 *
 * Agrega un jugador a un grupo YA existente (útil cuando un grupo quedó
 * incompleto o llega un jugador tardío que debe sumarse a uno con hueco).
 *
 * Acciones:
 *   1. Valida que el jugador no esté ya en ningún grupo del torneo
 *   2. Crea los partidos nuevos: nuevo jugador vs CADA jugador existente
 *   3. Actualiza el array `players` y `standings` del grupo
 *   4. Confirma la inscripción si estaba en PENDING
 *
 * Devuelve el grupo actualizado y los partidos nuevos creados.
 */
export async function addPlayerToGroup(
  tournamentId: mongoose.Types.ObjectId,
  groupId: mongoose.Types.ObjectId,
  playerId: mongoose.Types.ObjectId
) {
  // Obtener el grupo
  const group = await TournamentGroup.findOne({ _id: groupId, tournament: tournamentId });
  if (!group) throw new Error("Grupo no encontrado en este torneo.");

  // Verificar que el jugador no esté ya en el grupo
  const alreadyInGroup = group.players.some((p) => p.toString() === playerId.toString());
  if (alreadyInGroup) throw new Error("El jugador ya pertenece a este grupo.");

  // Verificar que no esté en OTRO grupo del mismo torneo
  const otherGroup = await TournamentGroup.findOne({
    tournament: tournamentId,
    _id: { $ne: groupId },
    players: playerId,
  });
  if (otherGroup) {
    throw new Error(`El jugador ya está asignado al grupo "${otherGroup.name}".`);
  }

  // Obtener handicap de la inscripción
  const reg = await TournamentRegistration.findOne({
    tournament: tournamentId,
    user: playerId,
  }).select("handicap status").lean();

  // Confirmar si está PENDING
  if (reg?.status === RegistrationStatus.PENDING) {
    await TournamentRegistration.updateOne(
      { tournament: tournamentId, user: playerId },
      { $set: { status: RegistrationStatus.CONFIRMED } }
    );
  }

  // Contar el matchNumber más alto actual del grupo para continuar desde ahí
  const lastMatch = await Match.findOne({ group: groupId }).sort({ matchNumber: -1 }).lean();
  let matchNumber = (lastMatch?.matchNumber ?? 0) + 1;

  // Crear partido: nuevo jugador vs cada jugador ya existente en el grupo
  const newMatches = [];
  for (const existingPlayerId of group.players) {
    const m = await Match.create({
      tournament: tournamentId,
      group: groupId,
      roundType: RoundType.GROUP,
      roundOrder: 1,
      matchNumber: matchNumber++,
      player1: existingPlayerId,
      player2: playerId,
      isBye: false,
      status: MatchStatus.PENDING,
    });
    newMatches.push(m);
  }

  // Agregar jugador al grupo
  group.players.push(playerId);
  group.standings.push({
    player: playerId,
    played: 0,
    wins: 0,
    losses: 0,
    points: 0,
    ...(reg?.handicap !== undefined && { handicap: reg.handicap }),
  });
  await group.save();

  return { group, newMatches };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3b. AUTO-CREAR GRUPOS (distribución automática)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * autoCreateGroups
 *
 * Distribuye automáticamente todos los jugadores CONFIRMADOS del torneo
 * en grupos usando el campo `playersPerGroup` del torneo (3, 4 o 5).
 *
 * Ejemplos con playersPerGroup=3:
 *   15 jugadores → 5 grupos de 3         (A:3, B:3, C:3, D:3, E:3)
 *   16 jugadores → 4 grupos de 3 + 2 de 2 (A:3, B:3, C:3, D:3, E:2, F:2)
 *    9 jugadores → 3 grupos de 3         (A:3, B:3, C:3)
 *   10 jugadores → 3 grupos de 3 + 1 de 1 → en realidad: 2 de 4 y 2 de 1... 
 *               → ceil(10/3)=4 grupos → bigSize=3, bigCount=2 → A:3, B:3, C:2, D:2
 *
 * Si el torneo no tiene playersPerGroup, usa 3 por defecto.
 */
export async function autoCreateGroups(
  tournamentId: mongoose.Types.ObjectId,
  playersPerGroupOverride?: number
): Promise<object[]> {

  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error("Torneo no encontrado.");

  const playersPerGroup = playersPerGroupOverride ?? tournament.playersPerGroup ?? 3;

  // Validación
  if (playersPerGroup < 3 || playersPerGroup > 5) {
    throw new Error("playersPerGroup debe ser 3, 4 o 5.");
  }

  // Obtener todos los jugadores confirmados
  const registrations = await TournamentRegistration.find({
    tournament: tournamentId,
    status: RegistrationStatus.CONFIRMED,
  }).select("user");

  if (registrations.length < 2) {
    throw new Error("Se necesitan al menos 2 jugadores confirmados para crear grupos.");
  }

  // Mezclar aleatoriamente para sorteo justo
  const playerIds = shuffleArray(
    registrations.map((r) => r.user as mongoose.Types.ObjectId)
  );

  const totalPlayers = playerIds.length;

  // Cuántos grupos se necesitan para que ninguno supere playersPerGroup
  const numberOfGroups = Math.ceil(totalPlayers / playersPerGroup);

  // Cuántos jugadores va en cada grupo de forma pareja:
  //   bigSize  = ceil(total / numberOfGroups)  → tamaño del grupo grande
  //   bigCount = cuántos grupos tendrán bigSize → los primeros bigCount grupos
  //   el resto tendrá bigSize - 1 jugadores
  //
  // Ejemplo: 16 jugadores, playersPerGroup=3 → numberOfGroups=6
  //   bigSize=3, bigCount=4 → 4 grupos de 3 y 2 grupos de 2
  // Ejemplo: 15 jugadores, playersPerGroup=3 → numberOfGroups=5
  //   bigSize=3, bigCount=5 → 5 grupos de 3
  const bigSize  = Math.ceil(totalPlayers / numberOfGroups);
  const bigCount = totalPlayers - (bigSize - 1) * numberOfGroups;

  const groupBuckets: mongoose.Types.ObjectId[][] = [];
  let playerIndex = 0;
  for (let g = 0; g < numberOfGroups; g++) {
    const size = g < bigCount ? bigSize : bigSize - 1;
    const bucket: mongoose.Types.ObjectId[] = [];
    for (let p = 0; p < size; p++) {
      bucket.push(playerIds[playerIndex]!);
      playerIndex++;
    }
    groupBuckets.push(bucket);
  }


  // idx=0→A, idx=25→Z, idx=26→AA, idx=701→ZZ, idx=702→AAA, sin límite.
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function groupName(idx: number): string {
    let name = "";
    let n = idx + 1; // pasar a base 1
    while (n > 0) {
      n--;                              // ajuste a índice 0 del alfabeto
      name = letters[n % 26]! + name;
      n = Math.floor(n / 26);
    }
    return name;
  }

  const groupsInput: GroupInput[] = groupBuckets
    .filter((bucket) => bucket.length >= 2)
    .map((bucket, idx) => ({
      name: groupName(idx),
      players: bucket,
      advanceCount: 2,
    }));

  if (groupsInput.length === 0) {
    throw new Error("No se pudieron formar grupos válidos (mínimo 2 jugadores por grupo).");
  }

  return createGroups(tournamentId, groupsInput);
}

/**
 * recordGroupResult
 *
 * Registra el resultado de un partido de grupos y recalcula
 * automáticamente la tabla de posiciones del grupo.
 */
export async function recordGroupResult(
  matchId: mongoose.Types.ObjectId,
  score1: number,
  score2: number
): Promise<object> {

  const match = await Match.findById(matchId);
  if (!match) throw new Error("Partido no encontrado.");
  if (match.roundType !== RoundType.GROUP) throw new Error("Este partido no es de fase de grupos.");
  if (match.status === MatchStatus.COMPLETED) throw new Error("Este partido ya tiene resultado.");
  if (!match.player1 || !match.player2) throw new Error("El partido no tiene ambos jugadores.");

  // Obtener el torneo para saber si usa handicap
  const tournament = await Tournament.findById(match.tournament).lean();
  if (!tournament) throw new Error("Torneo no encontrado.");

  // Obtener handicaps desde los standings del grupo
  const groupForHandicap = await TournamentGroup.findById(match.group);
  if (!groupForHandicap) throw new Error("Grupo no encontrado.");

  const s1 = groupForHandicap.standings.find((s) => s.player.toString() === match.player1!.toString());
  const s2 = groupForHandicap.standings.find((s) => s.player.toString() === match.player2!.toString());
  const h1 = s1?.handicap;
  const h2 = s2?.handicap;

  // Determinar ganador según si el torneo usa handicap
  let p1Wins: boolean;
  if (tournament.withHandicap) {
    // Torneo con handicap: validar que ambos lo tengan
    if (h1 === undefined || h2 === undefined) {
      throw new Error("Este torneo usa handicap pero uno o ambos jugadores no tienen handicap asignado.");
    }
    const ratio1 = score1 / h1;
    const ratio2 = score2 / h2;
    if (ratio1 === ratio2) throw new Error("No puede haber empate.");
    p1Wins = ratio1 > ratio2;
  } else {
    // Torneo sin handicap: ganador por marcador directo
    if (score1 === score2) throw new Error("No puede haber empate.");
    p1Wins = score1 > score2;
  }

  const winner = p1Wins ? match.player1 : match.player2;

  // Actualizar el partido
  await Match.findByIdAndUpdate(matchId, {
    score1,
    score2,
    winner,
    status: MatchStatus.COMPLETED,
    completedAt: new Date(),
  });

  // Recalcular standings del grupo (reusar el doc ya cargado)
  const group = groupForHandicap;

  const updatedStandings = group.standings.map((s) => {
    const isPlayer1 = s.player.toString() === match.player1!.toString();
    const isPlayer2 = s.player.toString() === match.player2!.toString();

    if (!isPlayer1 && !isPlayer2) return s;

    const won = isPlayer1 ? p1Wins : !p1Wins;
    return {
      player: s.player,
      played: s.played + 1,
      wins: won ? s.wins + 1 : s.wins,
      losses: !won ? s.losses + 1 : s.losses,
      points: won ? s.points + 2 : s.points,
    };
  });

  // Ordenar por puntos y asignar posición
  updatedStandings.sort(
    (a, b) => b.points - a.points || b.wins - a.wins
  );
  const standingsWithPosition = updatedStandings.map((s, idx) => ({
    ...s,
    position: idx + 1,
  }));

  await TournamentGroup.findByIdAndUpdate(match.group, {
    standings: standingsWithPosition,
  });

  // Obtener nombre del ganador y perdedor para la respuesta
  const winnerUser  = await User.findById(winner).select("name").lean();
  const loserId     = p1Wins ? match.player2 : match.player1;
  const loserUser   = await User.findById(loserId).select("name").lean();

  return {
    matchId,
    score1,
    score2,
    winner: { id: winner, name: winnerUser?.name ?? "Desconocido" },
    loser:  { id: loserId, name: loserUser?.name ?? "Desconocido" },
    group: group.name,
  };
}

/** Devuelve la potencia de 2 anterior o igual a n. Ej: 10→8, 9→8, 8→8 */
function previousPowerOf2(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. RONDA DE AJUSTE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateAdjustmentRound
 *
 * Cuando el total de clasificados NO es potencia de 2, crea una ronda
 * previa para reducir el campo al siguiente bracket menor.
 *
 * Ejemplo: 10 clasificados → bracket de 8
 *   - adjustmentMatches = 10 - 8 = 2 partidos
 *   - 4 peor-clasificados juegan entre sí (posición 2 de cada grupo)
 *   - 6 mejor-clasificados entran directo al bracket
 *
 * Los jugadores se ordenan: 1°A, 1°B, 1°C ... → mejor semilla
 *                            2°A, 2°B, 2°C ... → peor semilla (juegan ajuste)
 *
 * Devuelve info de los partidos de ajuste y los jugadores directos.
 */
export async function generateAdjustmentRound(tournamentId: mongoose.Types.ObjectId) {
  const groups = await TournamentGroup.find({ tournament: tournamentId });
  if (groups.length === 0) throw new Error("No hay grupos creados para este torneo.");

  // Verificar que todos los partidos de grupos estén terminados
  const pendingGroupMatches = await Match.countDocuments({
    tournament: tournamentId,
    roundType: RoundType.GROUP,
    status: { $ne: MatchStatus.COMPLETED },
  });
  if (pendingGroupMatches > 0) {
    throw new Error(`Aún hay ${pendingGroupMatches} partidos de grupos sin completar.`);
  }

  // Recopilar todos los clasificados ordenados por semilla:
  // Primero los 1eros de cada grupo (A→Z), luego los 2dos, etc.
  const byPosition: Map<number, mongoose.Types.ObjectId[]> = new Map();

  for (const group of [...groups].sort((a, b) => a.name.localeCompare(b.name))) {
    const sorted = [...group.standings].sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    const advancing = sorted.slice(0, group.advanceCount);

    advancing.forEach((s, idx) => {
      const pos = idx + 1;
      if (!byPosition.has(pos)) byPosition.set(pos, []);
      byPosition.get(pos)!.push(s.player as mongoose.Types.ObjectId);
    });
  }

  // Aplanar: 1eros primero, luego 2dos, etc.
  const allClassified: mongoose.Types.ObjectId[] = [];
  const sortedPositions = [...byPosition.keys()].sort((a, b) => a - b);
  for (const pos of sortedPositions) {
    allClassified.push(...byPosition.get(pos)!);
  }

  const total = allClassified.length;
  const bracketSize = previousPowerOf2(total);

  if (bracketSize === total) {
    throw new Error(
      `El total de clasificados (${total}) ya es potencia de 2. No se necesita ronda de ajuste. Usa directamente generate-bracket-from-groups.`
    );
  }

  const adjustmentMatchCount = total - bracketSize;
  const directCount          = total - adjustmentMatchCount * 2;
  const directPlayers        = allClassified.slice(0, directCount);
  const adjustmentPlayers    = allClassified.slice(directCount); // los peor clasificados

  // Verificar si ya existe la ronda de ajuste
  const existing = await Match.countDocuments({
    tournament: tournamentId,
    roundType: RoundType.ADJUSTMENT,
  });
  if (existing > 0) {
    throw new Error(
      `La ronda de ajuste ya fue creada (${existing} partidos). Registra los resultados pendientes o consulta GET /:id/adjustment-round.`
    );
  }

  // Crear los partidos de ajuste
  const adjustmentMatchDocs = [];
  for (let i = 0; i < adjustmentMatchCount; i++) {
    const p1 = adjustmentPlayers[i * 2]!;
    const p2 = adjustmentPlayers[i * 2 + 1]!;
    const doc = await Match.create({
      tournament: tournamentId,
      roundType: RoundType.ADJUSTMENT,
      roundOrder: 0,
      matchNumber: i + 1,
      player1: p1,
      player2: p2,
      isBye: false,
      status: MatchStatus.PENDING,
    });
    adjustmentMatchDocs.push(doc);
  }

  // Poblar jugadores para la respuesta
  const populated = await Match.find({
    tournament: tournamentId,
    roundType: RoundType.ADJUSTMENT,
  })
    .populate("player1", "name avatarUrl")
    .populate("player2", "name avatarUrl");

  return {
    bracketSize,
    directCount,
    adjustmentMatchCount,
    message: `${directCount} jugadores entran directo al bracket de ${bracketSize}. ${adjustmentMatchCount} partidos de ajuste determinan los ${adjustmentMatchCount} cupos restantes.`,
    adjustmentMatches: populated,
  };
}

/**
 * generateEliminationFromGroups (modificado)
 *
 * Una vez terminada la fase de grupos (y la ronda de ajuste si aplica):
 *   - Si hay partidos ADJUSTMENT completados, usa sus ganadores + directos
 *   - Si no hay ajuste, usa todos los clasificados de grupos directamente
 */
export async function generateEliminationFromGroups(
  tournamentId: mongoose.Types.ObjectId
): Promise<mongoose.Types.ObjectId[][]> {

  const groups = await TournamentGroup.find({ tournament: tournamentId });
  if (groups.length === 0) throw new Error("No hay grupos creados para este torneo.");

  // Verificar que todos los partidos de grupos estén terminados
  const pendingMatches = await Match.countDocuments({
    tournament: tournamentId,
    roundType: RoundType.GROUP,
    status: { $ne: MatchStatus.COMPLETED },
  });
  if (pendingMatches > 0) {
    throw new Error(`Aún hay ${pendingMatches} partidos de grupos sin completar.`);
  }

  // ── Recopilar clasificados por semilla (1eros primero, luego 2dos, etc.) ───
  const byPosition: Map<number, mongoose.Types.ObjectId[]> = new Map();

  for (const group of [...groups].sort((a, b) => a.name.localeCompare(b.name))) {
    const sorted = [...group.standings].sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    const advancing = sorted.slice(0, group.advanceCount);

    advancing.forEach((s, idx) => {
      const pos = idx + 1;
      if (!byPosition.has(pos)) byPosition.set(pos, []);
      byPosition.get(pos)!.push(s.player as mongoose.Types.ObjectId);
    });
  }

  const allClassified: mongoose.Types.ObjectId[] = [];
  const sortedPositions = [...byPosition.keys()].sort((a, b) => a - b);
  for (const pos of sortedPositions) {
    allClassified.push(...byPosition.get(pos)!);
  }

  // ── Verificar si hay ronda de ajuste ─────────────────────────────────────
  const adjustmentMatches = await Match.find({
    tournament: tournamentId,
    roundType: RoundType.ADJUSTMENT,
  });

  let finalPlayers: mongoose.Types.ObjectId[];

  if (adjustmentMatches.length > 0) {
    // Hay ronda de ajuste — todos deben estar completados
    const pendingAdj = adjustmentMatches.filter((m) => m.status !== MatchStatus.COMPLETED);
    if (pendingAdj.length > 0) {
      throw new Error(
        `Aún hay ${pendingAdj.length} partidos de ajuste sin completar. Termínalos antes de generar el bracket.`
      );
    }

    // Los jugadores que NO jugaron ajuste entran directo
    const adjustmentPlayerIds = new Set(
      adjustmentMatches.flatMap((m) => [m.player1?.toString(), m.player2?.toString()].filter(Boolean))
    );
    const directPlayers = allClassified.filter((id) => !adjustmentPlayerIds.has(id.toString()));

    // Los ganadores del ajuste completan el bracket
    const adjustmentWinners = adjustmentMatches
      .map((m) => m.winner)
      .filter((w): w is mongoose.Types.ObjectId => w !== null && w !== undefined);

    finalPlayers = [...directPlayers, ...adjustmentWinners];
  } else {
    // Sin ronda de ajuste: verificar que el total sea potencia de 2
    const isPowerOf2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
    if (!isPowerOf2(allClassified.length)) {
      const needed = previousPowerOf2(allClassified.length);
      const extra  = allClassified.length - needed;
      throw new Error(
        `Hay ${allClassified.length} jugadores clasificados pero ${allClassified.length} no es potencia de 2. ` +
        `Genera primero la ronda de ajuste (${extra} partido${extra !== 1 ? "s" : ""}) con POST /:id/generate-adjustment-round ` +
        `para reducir el campo a ${needed} jugadores.`
      );
    }
    finalPlayers = allClassified;
  }

  if (finalPlayers.length < 2) {
    throw new Error("No hay suficientes jugadores clasificados para generar el bracket.");
  }

  return generateBracket(tournamentId, finalPlayers);
}

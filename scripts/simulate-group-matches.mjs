/**
 * simulate-group-matches.mjs
 *
 * Obtiene todos los partidos de fase de grupos de un torneo y registra
 * resultados aleatorios en cada uno que esté pendiente (PENDING).
 *
 * Uso:
 *   node scripts/simulate-group-matches.mjs <tournamentId>
 *
 * Ejemplo:
 *   node scripts/simulate-group-matches.mjs 6998d0ab2b929ad396d46aed
 */

const BASE_URL = "http://localhost:3000/api";

// ── Configuración de scores aleatorios ──────────────────────────────────────
// Se genera un marcador entre MIN y MAX, y el perdedor siempre es menor.
const SCORE_MIN = 1;
const SCORE_MAX = 15;

/**
 * Genera dos scores distintos al azar.
 * Garantiza que no hay empate (obligatorio en la lógica del torneo).
 */
function randomScores() {
  let s1 = Math.floor(Math.random() * (SCORE_MAX - SCORE_MIN + 1)) + SCORE_MIN;
  let s2 = Math.floor(Math.random() * (SCORE_MAX - SCORE_MIN + 1)) + SCORE_MIN;
  while (s1 === s2) {
    s2 = Math.floor(Math.random() * (SCORE_MAX - SCORE_MIN + 1)) + SCORE_MIN;
  }
  return { score1: s1, score2: s2 };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const tournamentId = process.argv[2];

if (!tournamentId) {
  console.error("❌  Debes pasar el ID del torneo como argumento.");
  console.error("   Uso: node scripts/simulate-group-matches.mjs <tournamentId>");
  process.exit(1);
}

console.log(`\n🎱  Simulando partidos de grupos para torneo: ${tournamentId}\n`);

// 1. Obtener todos los partidos del torneo
const matchesRes = await fetch(`${BASE_URL}/matches/tournament/${tournamentId}`);
if (!matchesRes.ok) {
  const body = await matchesRes.text();
  console.error("❌  Error al obtener partidos:", matchesRes.status, body);
  process.exit(1);
}

const matchesData = await matchesRes.json();

// El endpoint devuelve { ok: true, data: { total, byRound, flat: [...] } }
let allMatches;
if (Array.isArray(matchesData)) {
  allMatches = matchesData;
} else if (Array.isArray(matchesData.data?.flat)) {
  allMatches = matchesData.data.flat;
} else if (Array.isArray(matchesData.data)) {
  allMatches = matchesData.data;
} else if (Array.isArray(matchesData.matches)) {
  allMatches = matchesData.matches;
} else {
  console.error("❌  No se pudo encontrar el array de partidos en la respuesta:", matchesData);
  process.exit(1);
}

// 2. Filtrar solo los de fase de grupos que estén pendientes
const pending = allMatches.filter(
  (m) => m.roundType === "GROUP" && m.status === "PENDING" && m.isBye === false
);

if (pending.length === 0) {
  console.log("✅  No hay partidos de grupo pendientes por simular.");
  process.exit(0);
}

console.log(`📋  Partidos pendientes encontrados: ${pending.length}\n`);

// 3. Registrar resultado en cada partido con una pequeña pausa entre llamadas
let ok = 0;
let failed = 0;

for (const match of pending) {
  const { score1, score2 } = randomScores();
  const player1Name = match.player1?.name ?? "Jugador 1";
  const player2Name = match.player2?.name ?? "Jugador 2";
  const groupName   = match.group?.name ?? "?";

  process.stdout.write(
    `  Grupo ${groupName} | ${player1Name} vs ${player2Name} → ${score1}-${score2} ... `
  );

  try {
    const res = await fetch(`${BASE_URL}/matches/${match._id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score1, score2 }),
    });

    if (res.ok) {
      const data = await res.json();
      const winnerName = data.winner?.name ?? data.winner ?? "?";
      console.log(`✅  Ganador: ${winnerName}`);
      ok++;
    } else {
      const errBody = await res.text();
      console.log(`❌  Error ${res.status}: ${errBody}`);
      failed++;
    }
  } catch (err) {
    console.log(`❌  Excepción: ${err.message}`);
    failed++;
  }

  // Pequeña pausa para no saturar el servidor
  await new Promise((r) => setTimeout(r, 80));
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`✅  Completados: ${ok}   ❌  Fallidos: ${failed}`);
console.log(`─────────────────────────────────────────────\n`);

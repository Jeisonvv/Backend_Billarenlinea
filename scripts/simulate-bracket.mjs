/**
 * simulate-bracket.mjs
 *
 * Simula todos los partidos del bracket eliminatorio de un torneo en orden:
 * ROUND_OF_16 → QUARTERFINAL → SEMIFINAL → FINAL
 *
 * Después de cada ronda espera a que los ganadores avancen antes de continuar.
 *
 * Uso:
 *   node scripts/simulate-bracket.mjs <tournamentId>
 *
 * Ejemplo:
 *   node scripts/simulate-bracket.mjs 6998d0ab2b929ad396d46aed
 */

const BASE_URL = "http://localhost:3000/api";

const SCORE_MIN = 1;
const SCORE_MAX = 15;

const ROUND_ORDER = [
  "ROUND_OF_128",
  "ROUND_OF_64",
  "ROUND_OF_32",
  "ROUND_OF_16",
  "QUARTERFINAL",
  "SEMIFINAL",
  "FINAL",
];

const ROUND_LABELS = {
  ROUND_OF_128: "Ronda de 128",
  ROUND_OF_64:  "Ronda de 64",
  ROUND_OF_32:  "Ronda de 32",
  ROUND_OF_16:  "Octavos de final",
  QUARTERFINAL: "Cuartos de final",
  SEMIFINAL:    "Semifinales",
  FINAL:        "Final",
};

function randomScores() {
  let s1 = Math.floor(Math.random() * (SCORE_MAX - SCORE_MIN + 1)) + SCORE_MIN;
  let s2 = Math.floor(Math.random() * (SCORE_MAX - SCORE_MIN + 1)) + SCORE_MIN;
  while (s1 === s2) {
    s2 = Math.floor(Math.random() * (SCORE_MAX - SCORE_MIN + 1)) + SCORE_MIN;
  }
  return { score1: s1, score2: s2 };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ─────────────────────────────────────────────────────────────────────

const tournamentId = process.argv[2];

if (!tournamentId) {
  console.error("❌  Debes pasar el ID del torneo como argumento.");
  console.error("   Uso: node scripts/simulate-bracket.mjs <tournamentId>");
  process.exit(1);
}

console.log(`\n🏆  Simulando bracket eliminatorio para torneo: ${tournamentId}\n`);

for (const roundType of ROUND_ORDER) {
  // Re-consultar el bracket en cada ronda para tener jugadores actualizados
  const freshRes = await fetch(`${BASE_URL}/tournaments/${tournamentId}/bracket`);
  const freshData = await freshRes.json();
  if (!freshData.ok) break;

  const round = freshData.data.rounds.find((r) => r.roundType === roundType);
  if (!round) continue;

  const label = ROUND_LABELS[roundType] ?? roundType;
  const pendingMatches = round.matches.filter(
    (m) => m.status === "PENDING" && m.player1 && m.player2
  );

  if (pendingMatches.length === 0) continue;

  console.log(`\n━━━  ${label.toUpperCase()}  (${pendingMatches.length} partidos)  ━━━━━━━━━━━━━━━━━━━━━`);

  for (const match of pendingMatches) {
    const { score1, score2 } = randomScores();
    const p1Name = match.player1?.name ?? match.player1?._id ?? "?";
    const p2Name = match.player2?.name ?? match.player2?._id ?? "?";

    const res = await fetch(`${BASE_URL}/matches/${match._id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score1, score2 }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`  ❌  Partido ${match._id} falló: ${res.status} ${body}`);
      continue;
    }

    const data = await res.json();
    // Si el endpoint no popula winner, lo deducimos del marcador local
    const winnerName = data.data?.match?.winner?.name ?? (score1 > score2 ? p1Name : p2Name);
    const loserName  = score1 > score2 ? p2Name : p1Name;

    console.log(`  ✅  ${p1Name} ${score1} - ${score2} ${p2Name}`);
    console.log(`      🏅 Ganador: ${winnerName}  |  ❌ Eliminado: ${loserName}`);

    await sleep(120);
  }

  await sleep(400); // esperar a que los ganadores avancen antes de la siguiente ronda
}

// Verificar campeón llamando al bracket actualizado
const finalRes = await fetch(`${BASE_URL}/tournaments/${tournamentId}/bracket`);
const finalData = await finalRes.json();
const finalRound = finalData.data?.rounds?.find((r) => r.roundType === "FINAL");
const finalMatch = finalRound?.matches?.[0];

console.log("\n");
console.log("════════════════════════════════════════════════════════");
if (finalMatch?.winner) {
  const campeon = finalMatch.winner.name ?? finalMatch.winner;
  console.log(`🏆  CAMPEÓN: ${campeon}`);
} else {
  console.log("🏆  Torneo finalizado (revisa el resultado de la final)");
}
console.log("════════════════════════════════════════════════════════\n");

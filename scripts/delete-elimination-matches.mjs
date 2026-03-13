import mongoose from "mongoose";

const TOURNAMENT_ID = "6998d0ab2b929ad396d46aed";
const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/billarenlinea";

await mongoose.connect(MONGO_URI);
console.log("Conectado a MongoDB");

const result = await mongoose.connection.collection("matches").deleteMany({
  tournament: new mongoose.Types.ObjectId(TOURNAMENT_ID),
  roundType: { $nin: ["GROUP", "ADJUSTMENT"] },
});

console.log(`Eliminados: ${result.deletedCount} partidos de eliminación`);

await mongoose.disconnect();

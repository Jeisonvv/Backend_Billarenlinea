import "dotenv/config";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/billarenlinea";
const REQUIRED_CONFIRMATION = "DELETE_ALL_DATA";

function hasConfirmation() {
  return process.argv.includes(`--confirm=${REQUIRED_CONFIRMATION}`)
    || process.env.WIPE_CONFIRM === REQUIRED_CONFIRMATION;
}

if (!hasConfirmation()) {
  console.error("Este script borra todos los documentos de la base de datos.");
  console.error(`Confirma con --confirm=${REQUIRED_CONFIRMATION} o WIPE_CONFIRM=${REQUIRED_CONFIRMATION}.`);
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log("Conectado a MongoDB");

try {
  const collections = await mongoose.connection.db.collections();
  let deletedCollections = 0;

  for (const collection of collections) {
    if (collection.collectionName.startsWith("system.")) {
      continue;
    }

    const result = await collection.deleteMany({});
    deletedCollections += 1;
    console.log(`Colección ${collection.collectionName}: ${result.deletedCount} documento(s) eliminados`);
  }

  console.log(`Limpieza completada. Colecciones procesadas: ${deletedCollections}`);
} finally {
  await mongoose.disconnect();
  console.log("Desconectado de MongoDB");
}
/**
 * db/connection.ts — Conexión a MongoDB
 *
 * Exporta la función `connectDB` que se llama una única vez al iniciar
 * el servidor. Si la conexión falla, el proceso termina con código 1
 * para que el orquestador (Docker, PM2, etc.) pueda reiniciarlo.
 *
 * La URI de conexión se lee desde la variable de entorno MONGODB_URI
 * definida en el archivo .env.
 */
import mongoose from 'mongoose';

/**
 * Conecta Mongoose a MongoDB usando MONGODB_URI del entorno.
 * Llama a process.exit(1) si la conexión falla.
 */
export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Conectado a MongoDB');
  } catch (err) {
    console.error('Error de conexión a MongoDB:', err);
    process.exit(1); // Termina el proceso para que se pueda reiniciar
  }
};

/**
 * Script de Verificación - Validar que los datos seeding se insertaron correctamente
 * 
 * Este script verifica que todos los datos ficticios están en la base de datos.
 * 
 * Uso: npx tsx src/utils/verifyData.ts
 */

import mongoose from "mongoose";
import User from "../models/user.model.ts";
import Product from "../models/product.model.ts";
import Order from "../models/order.model.ts";
import Tournament from "../models/tournament.model.ts";
import TournamentRegistration from "../models/tournament-registration.model.ts";
import Raffle from "../models/raffle.model.ts";
import RaffleTicket from "../models/raffle-ticket.model.ts";
import TransmissionRequest from "../models/transmission-request.model.ts";

// Colores
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function connectDB() {
  try {
    const mongoURI = process.env.MONGODB_URI || "mongodb://localhost:27017/billar-test";
    await mongoose.connect(mongoURI);
    log(`✓ Conectado a MongoDB`, colors.green);
    return true;
  } catch (error) {
    log(`✗ Error conectando a MongoDB`, colors.red);
    console.error(error);
    return false;
  }
}

interface DataCount {
  name: string;
  model: any;
  minExpected?: number;
}

async function verifyData() {
  try {
    log("\n" + "=".repeat(80), colors.bright);
    log("✅ VERIFICACIÓN DE DATOS - BILLAR EN LÍNEA", colors.bright);
    log("=".repeat(80) + "\n", colors.bright);

    const connected = await connectDB();
    if (!connected) process.exit(1);

    // Definir modelos a verificar
    const models: DataCount[] = [
      { name: "Usuarios", model: User, minExpected: 5 },
      { name: "Productos", model: Product, minExpected: 4 },
      { name: "Pedidos", model: Order, minExpected: 3 },
      { name: "Torneos", model: Tournament, minExpected: 2 },
      { name: "Inscripciones", model: TournamentRegistration, minExpected: 2 },
      { name: "Rifas", model: Raffle, minExpected: 2 },
      { name: "Boletos de Rifa", model: RaffleTicket, minExpected: 5 },
      { name: "Solicitudes de Transmisión", model: TransmissionRequest, minExpected: 1 },
    ];

    log("📊 Contando documentos en la base de datos...\n", colors.cyan);

    let allPassed = true;
    const results: Array<{ name: string; count: number; passed: boolean }> = [];

    for (const item of models) {
      try {
        const count = await item.model.countDocuments();
        const passed = count >= (item.minExpected || 0);

        const status = passed ? "✓" : "✗";
        const color = passed ? colors.green : colors.yellow;

        log(
          `  ${status} ${item.name}: ${count} documentos ${
            item.minExpected ? `(mínimo esperado: ${item.minExpected})` : ""
          }`,
          color
        );

        results.push({ name: item.name, count, passed });
        if (!passed) allPassed = false;
      } catch (error) {
        log(`  ✗ Error verificando ${item.name}`, colors.red);
        console.error(error);
        allPassed = false;
      }
    }

    // Resumen
    log("\n" + "=".repeat(80), colors.bright);
    if (allPassed) {
      log("✅ TODOS LOS DATOS SE VERIFICARON CORRECTAMENTE", colors.green);
    } else {
      log("⚠️  ALGUNOS DATOS NO MET EL MÍNIMO ESPERADO", colors.yellow);
    }
    log("=".repeat(80) + "\n", colors.bright);

    // Tabla de resumen
    log("📋 Resumen:", colors.cyan);
    log("┌─ Modelo ──────────────────── ─ Cantidad ─┐");
    results.forEach(({ name, count }) => {
      const padding = " ".repeat(Math.max(0, 27 - name.length));
      log(`│ ${name}${padding} ${count.toString().padStart(5)} │`);
    });
    log("└────────────────────────────────────────┘\n");

    // Ejemplos de datos
    log("📝 Ejemplo de Documentos:\n", colors.cyan);

    try {
      const exampleUser = await User.findOne();
      if (exampleUser) {
        log(`  Usuario: ${exampleUser.name} (${exampleUser._id})`, colors.yellow);
      }

      const exampleProduct = await Product.findOne();
      if (exampleProduct) {
        log(`  Producto: ${exampleProduct.name} - $${exampleProduct.basePrice}`, colors.yellow);
      }

      const exampleOrder = await Order.findOne();
      if (exampleOrder) {
        log(`  Pedido: $${exampleOrder.total} - Estado: ${exampleOrder.status}`, colors.yellow);
      }

      const exampleTournament = await Tournament.findOne();
      if (exampleTournament) {
        log(
          `  Torneo: ${exampleTournament.name} - ${exampleTournament.currentParticipants}/${exampleTournament.maxParticipants} participantes`,
          colors.yellow
        );
      }

      const exampleRaffle = await Raffle.findOne();
      if (exampleRaffle) {
        log(
          `  Rifa: ${exampleRaffle.name} - ${exampleRaffle.soldTickets}/${exampleRaffle.totalTickets} boletos vendidos`,
          colors.yellow
        );
      }
    } catch (error) {
      log("  ⚠️  Error mostrando ejemplos", colors.yellow);
    }

    log("\n✓ Verificación completada\n", colors.green);
  } catch (error) {
    log("✗ Error durante la verificación", colors.red);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    log("✓ Desconectado de MongoDB\n", colors.green);
    process.exit(0);
  }
}

// Ejecutar
verifyData();

/**
 * Script de Prueba - Insertar datos ficticios en todos los modelos
 *
 * Este script:
 * 1. Se conecta a MongoDB
 * 2. Limpia las colecciones existentes (CUIDADO: elimina datos)
 * 3. Crea datos ficticios realistas usando faker
 * 4. Valida que todo funcione correctamente
 * 5. Muestra un reporte de resultados
 *
 * Uso: npx ts-node src/utils/seedData.ts
 */

import dotenv from "dotenv";
dotenv.config(); // Carga MONGODB_URI desde .env

import mongoose from "mongoose";
import { faker } from "@faker-js/faker";
import User from "../models/user.model.ts";
import Product from "../models/product.model.ts";
import Order from "../models/order.model.ts";
import Tournament from "../models/tournament.model.ts";
import TournamentRegistration from "../models/tournament-registration.model.ts";
import Raffle from "../models/raffle.model.ts";
import RaffleTicket from "../models/raffle-ticket.model.ts";
import TransmissionRequest from "../models/transmission-request.model.ts";
import {
  Channel,
  UserSource,
  UserStatus,
  PlayerCategory,
  InterestType,
  UserRole,
  ProductCategory,
  OrderStatus,
  PaymentMethod,
  TournamentStatus,
  TournamentFormat,
  RaffleStatus,
  RegistrationStatus,
} from "../models/enums.ts";

// ─────────────────────────────────────────────────────────────────────────────
// COLORES PARA LA CONSOLA
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES DE AYUDA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Espera un tiempo en ms (para simular operaciones)
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Conecta a MongoDB desde variable de entorno MONGODB_URI
 */
async function connectDB() {
  try {
    const mongoURI = process.env.MONGODB_URI || "mongodb://localhost:27017/billar_en_linea";
    await mongoose.connect(mongoURI);
    log(`✓ Conectado a MongoDB: ${mongoURI}`, colors.green);
  } catch (error) {
    log(`✗ Error de conexión a MongoDB`, colors.red);
    console.error(error);
    process.exit(1);
  }
}

/**
 * Limpia todas las colecciones (DESTRUCTIVO)
 */
async function clearAllCollections() {
  const collections = await mongoose.connection.collections;
  for (const collectionName in collections) {
    const collection = collections[collectionName];
    if (collection) {
      await collection.deleteMany({});
    }
  }
  log("✓ Colecciones limpiadas", colors.green);
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERADORES DE DATOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea usuarios ficticios
 */
async function seedUsers(count: number = 5) {
  log(`\n→ Creando ${count} usuarios...`, colors.cyan);

  const users = [];

  for (let i = 0; i < count; i++) {
    const userData = {
      identities: [
        {
          provider: Channel.WHATSAPP,
          providerId: `+57${faker.number.int({min: 3000000000, max: 3999999999})}`,
          verifiedAt: faker.date.past(),
        },
      ],
      webAuth: {
        email: faker.internet.email(),
        passwordHash: faker.internet.password({ length: 60 }), // Simulando hash bcrypt
        emailVerified: true,
      },
      name: faker.person.fullName(),
      phone: `+57${faker.number.int({min: 3000000000, max: 3999999999})}`,
      avatarUrl: faker.image.avatar(),
      source: faker.helpers.arrayElement(Object.values(UserSource)),
      status: faker.helpers.arrayElement(Object.values(UserStatus)),
      playerCategory: faker.helpers.arrayElement(Object.values(PlayerCategory)),
      role: UserRole.CUSTOMER, // Por defecto cliente
      tags: [faker.word.adjective(), faker.word.adjective()],
      consent: {
        marketing: faker.datatype.boolean(),
        whatsapp: faker.datatype.boolean(),
        email: faker.datatype.boolean(),
        updatedAt: new Date(),
      },
      conversationStates: [
        {
          channel: Channel.WHATSAPP,
          currentState: "IDLE",
          lastActivityAt: faker.date.recent(),
        },
      ],
      interests: [
        {
          type: faker.helpers.arrayElement(Object.values(InterestType)),
          lastInteraction: faker.date.recent(),
          count: faker.number.int({ min: 1, max: 10 }),
          channel: Channel.WHATSAPP,
        },
      ],
      lastInteractionAt: faker.date.recent(),
      lastInteractionChannel: Channel.WHATSAPP,
    };

    try {
      const user = await User.create(userData);
      users.push(user);
      log(`  ✓ Usuario creado: ${user.name} (${user._id})`, colors.yellow);
    } catch (error) {
      log(`  ✗ Error creando usuario`, colors.red);
      console.error(error);
    }
  }

  return users;
}

/**
 * Crea productos ficticios
 */
async function seedProducts(count: number = 5) {
  log(`\n→ Creando ${count} productos...`, colors.cyan);

  const products = [];

  for (let i = 0; i < count; i++) {
    const productData = {
      name: `${faker.commerce.productAdjective()} ${faker.commerce.productName()}`,
      description: faker.commerce.productDescription(),
      category: faker.helpers.arrayElement(Object.values(ProductCategory)),
      basePrice: faker.number.int({ min: 50000, max: 500000 }),
      images: [faker.image.url()],
      variants: [
        {
          name: `Variante ${faker.number.int({ min: 1, max: 3 })}`,
          sku: `SKU-${faker.number.int({min: 10000, max: 99999})}`,
          price: faker.number.int({ min: 50000, max: 500000 }),
          stock: faker.number.int({ min: 1, max: 50 }),
        },
      ],
      isActive: true,
      tags: [faker.word.noun(), faker.word.adjective()],
    };

    try {
      const product = await Product.create(productData);
      products.push(product);
      log(
        `  ✓ Producto creado: ${product.name} ($${product.basePrice}) (${product._id})`,
        colors.yellow
      );
    } catch (error) {
      log(`  ✗ Error creando producto`, colors.red);
      console.error(error);
    }
  }

  return products;
}

/**
 * Crea pedidos ficticios vinculados a usuarios y productos
 */
async function seedOrders(users: any[], products: any[], count: number = 3) {
  log(`\n→ Creando ${count} pedidos...`, colors.cyan);

  const orders = [];

  for (let i = 0; i < count; i++) {
    const user = faker.helpers.arrayElement(users);
    const selectedProducts = faker.helpers.arrayElements(products, {
      min: 1,
      max: 3,
    });

    const items = selectedProducts.map((product: any) => ({
      product: product._id,
      productName: product.name,
      variantName: product.variants[0]?.name,
      quantity: faker.number.int({ min: 1, max: 5 }),
      unitPrice: product.variants[0]?.price || product.basePrice,
      subtotal:
        faker.number.int({ min: 1, max: 5 }) *
        (product.variants[0]?.price || product.basePrice),
    }));

    const total = items.reduce((sum: number, item: any) => sum + item.subtotal, 0);

    const orderData = {
      user: user._id,
      items,
      total,
      status: faker.helpers.arrayElement(Object.values(OrderStatus)),
      paymentMethod: faker.helpers.arrayElement(Object.values(PaymentMethod)),
      paymentReference: faker.number.int({min: 100000000000000, max: 999999999999999}).toString(),
      channel: faker.helpers.arrayElement(Object.values(Channel)),
      notes: faker.lorem.sentence(),
      shippingAddress: faker.location.streetAddress(),
      paidAt: faker.date.recent(),
    };

    try {
      const order = await Order.create(orderData);
      orders.push(order);
      log(
        `  ✓ Pedido creado: $${order.total} para ${user.name} (${order._id})`,
        colors.yellow
      );
    } catch (error) {
      log(`  ✗ Error creando pedido`, colors.red);
      console.error(error);
    }
  }

  return orders;
}

/**
 * Crea torneos ficticios
 */
async function seedTournaments(users: any[], count: number = 2) {
  log(`\n→ Creando ${count} torneos...`, colors.cyan);

  const tournaments = [];

  for (let i = 0; i < count; i++) {
    const admin = faker.helpers.arrayElement(users);
    const startDate = faker.date.future();
    const registrationDeadline = new Date(startDate);
    registrationDeadline.setDate(registrationDeadline.getDate() - 7);

    const tournamentData = {
      name: `${faker.commerce.department()} ${new Date().getFullYear()}`,
      description: faker.lorem.paragraph(),
      format: faker.helpers.arrayElement(Object.values(TournamentFormat)),
      status: TournamentStatus.OPEN,
      allowedCategories: [
        faker.helpers.arrayElement(Object.values(PlayerCategory)),
      ],
      maxParticipants: faker.number.int({ min: 8, max: 64 }),
      currentParticipants: faker.number.int({ min: 0, max: 10 }),
      entryFee: faker.number.int({ min: 0, max: 100000 }),
      prizes: [
        {
          position: 1,
          description: "Taco Predator + $500.000",
          amount: 500000,
        },
        {
          position: 2,
          description: "Juego de bolas Diamond",
          amount: 0,
        },
      ],
      startDate,
      registrationDeadline,
      location: faker.location.streetAddress(),
      streamUrl: faker.internet.url(),
      imageUrl: faker.image.url(),
      playersPerGroup: faker.helpers.arrayElement([3, 4, 5]),
      createdBy: admin._id,
    };

    try {
      const tournament = await Tournament.create(tournamentData);
      tournaments.push(tournament);
      log(
        `  ✓ Torneo creado: ${tournament.name} (${tournament._id})`,
        colors.yellow
      );
    } catch (error) {
      log(`  ✗ Error creando torneo`, colors.red);
      console.error(error);
    }
  }

  return tournaments;
}

/**
 * Crea inscripciones a torneos
 */
async function seedTournamentRegistrations(users: any[], tournaments: any[], count: number = 3) {
  log(`\n→ Creando hasta ${count} inscripciones a torneos...`, colors.cyan);

  const registrations = [];
  const used = new Set<string>(); // clave "userId_tournamentId" para evitar duplicados

  // Generar candidatos únicos barajando combinaciones
  const candidates: { user: any; tournament: any }[] = [];
  for (const tournament of tournaments) {
    const shuffledUsers = faker.helpers.shuffle([...users]);
    for (const user of shuffledUsers) {
      candidates.push({ user, tournament });
    }
  }
  faker.helpers.shuffle(candidates);

  for (const { user, tournament } of candidates) {
    if (registrations.length >= count) break;

    const key = `${user._id}_${tournament._id}`;
    if (used.has(key)) continue;
    used.add(key);

    try {
      const registration = await TournamentRegistration.create({
        tournament: tournament._id,
        user: user._id,
        status: RegistrationStatus.CONFIRMED,
        playerCategory: faker.helpers.arrayElement(Object.values(PlayerCategory)),
        channel: faker.helpers.arrayElement(Object.values(Channel)),
        handicap: faker.number.int({ min: 20, max: 70 }),
        paymentMethod: faker.helpers.arrayElement(Object.values(PaymentMethod)),
        paymentReference: faker.number.int({ min: 100000, max: 999999 }).toString(),
        paidAt: faker.date.recent(),
      });
      registrations.push(registration);
      log(
        `  ✓ Inscripción creada: ${user.name} → ${tournament.name} (${registration._id})`,
        colors.yellow
      );
    } catch (error: any) {
      if (error?.code !== 11000) {
        log(`  ✗ Error creando inscripción`, colors.red);
        console.error(error);
      }
    }
  }

  return registrations;
}

/**
 * Crea rifas ficticias
 */
async function seedRaffles(users: any[], count: number = 2) {
  log(`\n→ Creando ${count} rifas...`, colors.cyan);

  const raffles = [];

  for (let i = 0; i < count; i++) {
    const admin = faker.helpers.arrayElement(users);
    const drawDate = faker.date.future();

    const raffleData = {
      name: `Rifa ${faker.commerce.product()}`,
      description: faker.lorem.paragraph(),
      status: RaffleStatus.ACTIVE,
      prize: faker.commerce.productName(),
      prizeImageUrl: faker.image.url(),
      ticketPrice: faker.number.int({ min: 10000, max: 100000 }),
      totalTickets: faker.number.int({ min: 50, max: 500 }),
      soldTickets: faker.number.int({ min: 0, max: 100 }),
      drawDate,
      imageUrl: faker.image.url(),
      createdBy: admin._id,
    };

    try {
      const raffle = await Raffle.create(raffleData);
      raffles.push(raffle);
      log(
        `  ✓ Rifa creada: ${raffle.name} (${raffle._id})`,
        colors.yellow
      );
    } catch (error) {
      log(`  ✗ Error creando rifa`, colors.red);
      console.error(error);
    }
  }

  return raffles;
}

/**
 * Crea boletos de rifa
 */
async function seedRaffleTickets(users: any[], raffles: any[], count: number = 5) {
  log(`\n→ Creando ${count} boletos de rifa...`, colors.cyan);

  const tickets = [];

  for (let i = 0; i < count; i++) {
    const user = faker.helpers.arrayElement(users);
    const raffle = faker.helpers.arrayElement(raffles);
    const quantity = faker.number.int({ min: 1, max: 5 });
    const ticketNumbers = Array.from({ length: quantity }, (_, idx) =>
      faker.number.int({ min: 1, max: 500 })
    );

    const ticketData = {
      raffle: raffle._id,
      user: user._id,
      numbers: ticketNumbers,
      quantity,
      unitPrice: raffle.ticketPrice,
      total: quantity * raffle.ticketPrice,
      status: faker.helpers.arrayElement(["AVAILABLE", "RESERVED", "PAID", "WINNER"]),
      paymentMethod: faker.helpers.arrayElement(Object.values(PaymentMethod)),
      paymentReference: faker.number.int({min: 100000000000000, max: 999999999999999}).toString(),
      paidAt: faker.date.past(),
      channel: faker.helpers.arrayElement(Object.values(Channel)),
      isWinner: false,
    };

    try {
      const ticket = await RaffleTicket.create(ticketData);
      tickets.push(ticket);
      log(
        `  ✓ Boleto creado: ${quantity} boletos para ${user.name} (${ticket._id})`,
        colors.yellow
      );
    } catch (error) {
      log(`  ✗ Error creando boleto`, colors.red);
      console.error(error);
    }
  }

  return tickets;
}

/**
 * Crea solicitudes ficticias de transmisión
 */
async function seedTransmissions(tournaments: any[], users: any[], count: number = 2) {
  log(`\n→ Creando ${count} transmisiones...`, colors.cyan);

  const transmissions = [];

  for (let i = 0; i < count; i++) {
    const tournament = faker.helpers.arrayElement(tournaments);
    const admin = faker.helpers.arrayElement(users);

    const transmissionData = {
      contactName: admin.name,
      contactPhone: Number(faker.string.numeric(10)),
      billiardName: tournament.name,
      city: faker.location.city(),
      tournamentType: faker.helpers.arrayElement(["RELAMPAGO", "ABIERTO"]),
      eventDate: faker.date.future().toISOString(),
      serviceType: faker.helpers.arrayElement(["TRANSMISION", "ORGANIZACION", "AMBOS"]),
      status: faker.helpers.arrayElement(["PENDIENTE", "COTIZADO", "CONFIRMADO", "RECHAZADO"]),
      comments: faker.lorem.sentence(),
      whatsappId: admin.identities?.[0]?.providerId,
    };

    try {
      const transmission = await TransmissionRequest.create(transmissionData);
      transmissions.push(transmission);
      log(
        `  ✓ Solicitud de transmisión creada: ${transmission.billiardName} (${transmission._id})`,
        colors.yellow
      );
    } catch (error) {
      log(`  ✗ Error creando transmisión`, colors.red);
      console.error(error);
    }
  }

  return transmissions;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

async function seedDatabase() {
  try {
    log("\n" + "=".repeat(80), colors.bright);
    log("🌱 SEEDING DE BASE DE DATOS - BILLAR EN LÍNEA", colors.bright);
    log("=".repeat(80) + "\n", colors.bright);

    // Conectar a BD
    await connectDB();
    await delay(500);

    // Limpiar colecciones
    log("\n→ Limpiando base de datos...", colors.cyan);
    await clearAllCollections();
    await delay(500);

    // Crear datos en orden de dependencias
    const users = await seedUsers(26);
    await delay(300);

    const products = await seedProducts(6);
    await delay(300);

    const orders = await seedOrders(users, products, 5);
    await delay(300);

    const tournaments = await seedTournaments(users, 3);
    await delay(300);

    // Torneo principal: el primero tiene TODOS los 26 jugadores inscritos
    const mainTournament = tournaments[0]!;
    log(`\n→ Inscribiendo los 26 usuarios en "${mainTournament.name}"...`, colors.cyan);
    let mainRegistrations = 0;
    for (const user of users) {
      try {
        await TournamentRegistration.create({
          tournament: mainTournament._id,
          user: user._id,
          status: RegistrationStatus.CONFIRMED,
          playerCategory: faker.helpers.arrayElement(Object.values(PlayerCategory)),
          channel: faker.helpers.arrayElement(Object.values(Channel)),
          handicap: faker.number.int({ min: 20, max: 70 }),
          paymentMethod: faker.helpers.arrayElement(Object.values(PaymentMethod)),
          paymentReference: faker.number.int({ min: 100000, max: 999999 }).toString(),
          paidAt: faker.date.recent(),
        });
        mainRegistrations++;
        log(`  ✓ ${user.name} inscrito`, colors.yellow);
      } catch {
        // puede ocurrir si el mismo usuario ya fue inscrito (duplicado)
      }
    }
    log(`  → ${mainRegistrations} inscripciones creadas en torneo principal`, colors.green);
    await delay(300);

    // Inscripciones aleatorias en los otros torneos
    await seedTournamentRegistrations(users, tournaments.slice(1), 10);
    await delay(300);

    const raffles = await seedRaffles(users, 3);
    await delay(300);

    await seedRaffleTickets(users, raffles, 8);
    await delay(300);

    await seedTransmissions(tournaments, users, 2);
    await delay(300);

    // Reporte final
    log("\n" + "=".repeat(80), colors.bright);
    log("✓ SEEDING COMPLETADO", colors.green);
    log("=".repeat(80), colors.bright);

    log(
      `\n📊 Resumen de datos creados:
  • Usuarios:      ${users.length}
  • Productos:     ${products.length}
  • Pedidos:       ${orders.length}
  • Torneos:       ${tournaments.length}
  • Inscripciones: ${mainRegistrations} en torneo principal + 10 aleatorias
  • Rifas:         ${raffles.length}
  • Boletos:       8
  • Solicitudes de transmisión: 2

  ★ Torneo principal: "${mainTournament.name}" (${mainTournament._id})
    → Todos los ${users.length} usuarios inscritos y CONFIRMADOS
    → Usar este ID para probar auto-groups
    `,
      colors.green
    );

    log("✓ Todos los modelos funcionan correctamente\n", colors.green);
  } catch (error) {
    log("✗ Error durante el seeding", colors.red);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    log("✓ Desconectado de MongoDB\n", colors.green);
    process.exit(0);
  }
}

// Ejecutar el script
seedDatabase();

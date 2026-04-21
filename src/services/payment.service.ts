import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import PaymentTransaction from "../models/payment-transaction.model.js";
import Raffle from "../models/raffle.model.js";
import RaffleNumber, { normalizeRaffleNumberInput } from "../models/raffle-number.model.js";
import RaffleTicket from "../models/raffle-ticket.model.js";
import Tournament from "../models/tournament.model.js";
import TournamentRegistration from "../models/tournament-registration.model.js";
import User from "../models/user.model.js";
import {
  Channel,
  PaymentMethod,
  PaymentPayableType,
  PaymentProvider,
  PaymentTransactionStatus,
  PlayerCategory,
  RaffleNumberStatus,
  RaffleStatus,
  RegistrationStatus,
  TicketStatus,
  TournamentStatus,
  UserRole,
} from "../models/enums.js";
import {
  createWompiCheckoutConfig,
  getWompiRedirectUrl,
  normalizeWompiTransactionStatus,
  sha256Hex,
  type WompiEventPayload,
  verifyWompiEvent,
} from "./wompi.service.js";
import {
  ensureTournamentRegistrantIdentityDocument,
  selfRegisterToTournamentService,
} from "./tournament.service.js";

interface ActorContext {
  id: string;
  role: UserRole;
}

interface CreateWompiCheckoutParams {
  userId?: string;
  numbers: Array<string | number>;
  channel?: string;
}

interface CreateTournamentWompiCheckoutParams {
  userId?: string;
  channel?: string;
  playerCategory?: string;
  handicap?: number;
  notes?: string;
}

type TournamentPricingType = "DISCOUNT_20" | "DISCOUNT_10" | "FULL";

interface TournamentCheckoutPricing {
  pricingType: TournamentPricingType;
  discountPercentage: 0 | 10 | 20;
  originalAmount: number;
  finalAmount: number;
  amountInCents: number;
  expiresAt: Date;
}

const DEFAULT_RESERVATION_MINUTES = Number(process.env.RAFFLE_RESERVATION_MINUTES ?? 15);
const RETRYABLE_PAYMENT_STATUSES = new Set<PaymentTransactionStatus>([
  PaymentTransactionStatus.EXPIRED,
  PaymentTransactionStatus.DECLINED,
  PaymentTransactionStatus.VOIDED,
  PaymentTransactionStatus.ERROR,
]);

function toObjectId(id: string, fieldName: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`${fieldName} inválido.`);
  }

  return new mongoose.Types.ObjectId(id);
}

function getCheckoutChannel(inputChannel?: string) {
  if (!inputChannel) return Channel.WEB;

  if (!Object.values(Channel).includes(inputChannel as Channel)) {
    throw new Error("Canal de compra inválido.");
  }

  return inputChannel as Channel;
}

function splitPhone(phone?: string | null) {
  if (!phone) return undefined;

  const trimmed = phone.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("+57") && trimmed.length > 3) {
    return {
      phoneNumberPrefix: "+57",
      phoneNumber: trimmed.slice(3),
    };
  }

  if (trimmed.startsWith("57") && trimmed.length > 2) {
    return {
      phoneNumberPrefix: "+57",
      phoneNumber: trimmed.slice(2),
    };
  }

  return undefined;
}

function generatePaymentReference(prefix: string, entityId: string) {
  return `${prefix}-${entityId.slice(-6)}-${Date.now()}-${randomBytes(4).toString("hex")}`.toUpperCase();
}

function buildRaffleIdempotencyKey(userId: string, raffleId: string, numbers: string[]) {
  const normalizedNumbers = [...numbers].sort((left, right) => left.localeCompare(right));
  return sha256Hex(`RAFFLE|${userId}|${raffleId}|${normalizedNumbers.join(",")}`);
}

function buildTournamentIdempotencyKey(userId: string, tournamentId: string) {
  return sha256Hex(`TOURNAMENT|${userId}|${tournamentId}`);
}

function getEarlierDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

function getTournamentFinalPaymentDeadline(tournament: {
  startDate: Date;
  registrationDeadline: Date;
}) {
  const oneDayBeforeStart = new Date(tournament.startDate.getTime() - 24 * 60 * 60 * 1000);
  return getEarlierDate(oneDayBeforeStart, tournament.registrationDeadline);
}

function resolveTournamentCheckoutPricing(tournament: {
  entryFee: number;
  startDate: Date;
  registrationDeadline: Date;
  discount20Deadline?: Date;
  discount10Deadline?: Date;
}) {
  const now = new Date();
  const finalPaymentDeadline = getTournamentFinalPaymentDeadline(tournament);

  if (now.getTime() > finalPaymentDeadline.getTime()) {
    throw new Error("La fecha límite de pago de la inscripción ya venció.");
  }

  const originalAmount = tournament.entryFee;

  if (tournament.discount20Deadline && now.getTime() <= tournament.discount20Deadline.getTime()) {
    const expiresAt = getEarlierDate(tournament.discount20Deadline, finalPaymentDeadline);
    const finalAmount = Math.round(originalAmount * 0.8);

    return {
      pricingType: "DISCOUNT_20",
      discountPercentage: 20,
      originalAmount,
      finalAmount,
      amountInCents: finalAmount * 100,
      expiresAt,
    } satisfies TournamentCheckoutPricing;
  }

  if (tournament.discount10Deadline && now.getTime() <= tournament.discount10Deadline.getTime()) {
    const expiresAt = getEarlierDate(tournament.discount10Deadline, finalPaymentDeadline);
    const finalAmount = Math.round(originalAmount * 0.9);

    return {
      pricingType: "DISCOUNT_10",
      discountPercentage: 10,
      originalAmount,
      finalAmount,
      amountInCents: finalAmount * 100,
      expiresAt,
    } satisfies TournamentCheckoutPricing;
  }

  return {
    pricingType: "FULL",
    discountPercentage: 0,
    originalAmount,
    finalAmount: originalAmount,
    amountInCents: originalAmount * 100,
    expiresAt: finalPaymentDeadline,
  } satisfies TournamentCheckoutPricing;
}

function mapWompiProviderMethodToPaymentMethod(method?: string) {
  switch ((method ?? "").toUpperCase()) {
    case PaymentMethod.CARD:
      return PaymentMethod.CARD;
    case PaymentMethod.NEQUI:
      return PaymentMethod.NEQUI;
    case PaymentMethod.DAVIPLATA:
      return PaymentMethod.DAVIPLATA;
    case PaymentMethod.TRANSFER:
      return PaymentMethod.TRANSFER;
    default:
      return undefined;
  }
}

function getExistingRaffleResponseData(
  payment: {
    _id: mongoose.Types.ObjectId;
    reference: string;
    amountInCents: number;
    currency: string;
    expiresAt?: Date;
    redirectUrl?: string;
    status: PaymentTransactionStatus;
    customerEmail?: string;
    customerName?: string;
    customerPhone?: string;
  },
  ticket: {
    _id: mongoose.Types.ObjectId;
    numbers: string[];
    total: number;
  },
  raffle: {
    _id: mongoose.Types.ObjectId;
    name: string;
    ticketPrice: number;
  },
) {
  const phoneData = splitPhone(payment.customerPhone);
  const redirectUrl = payment.redirectUrl ?? getWompiRedirectUrl("raffles");

  return {
    paymentId: payment._id,
    ticketId: ticket._id,
    status: payment.status,
    alreadyProcessed: payment.status === PaymentTransactionStatus.APPROVED,
    ...(payment.expiresAt ? { reservationExpiresAt: payment.expiresAt.toISOString() } : {}),
    ...createWompiCheckoutConfig({
      reference: payment.reference,
      amountInCents: payment.amountInCents,
      currency: payment.currency,
      ...(payment.expiresAt ? { expirationTime: payment.expiresAt.toISOString() } : {}),
      redirectUrl,
      customerData: {
        email: payment.customerEmail ?? "",
        ...(payment.customerName ? { fullName: payment.customerName } : {}),
        ...(phoneData ?? {}),
      },
    }),
    raffle: {
      id: raffle._id,
      name: raffle.name,
      ticketPrice: raffle.ticketPrice,
      numbers: ticket.numbers,
      total: ticket.total,
    },
  };
}

function getExistingTournamentResponseData(
  payment: {
    _id: mongoose.Types.ObjectId;
    reference: string;
    amountInCents: number;
    currency: string;
    redirectUrl?: string;
    expiresAt?: Date;
    status: PaymentTransactionStatus;
    customerEmail?: string;
    customerName?: string;
    customerPhone?: string;
    metadata?: Record<string, unknown>;
  },
  registration: {
    _id: mongoose.Types.ObjectId;
    status: RegistrationStatus;
    playerCategory: string;
    handicap?: number;
  },
  tournament: {
    _id: mongoose.Types.ObjectId;
    name: string;
    entryFee: number;
    startDate: Date;
  },
) {
  const phoneData = splitPhone(payment.customerPhone);
  const redirectUrl = payment.redirectUrl ?? getWompiRedirectUrl("tournaments");
  const pricingType = typeof payment.metadata?.pricingType === "string"
    ? payment.metadata.pricingType
    : "FULL";
  const discountPercentage = typeof payment.metadata?.discountPercentage === "number"
    ? payment.metadata.discountPercentage
    : 0;
  const originalAmount = typeof payment.metadata?.originalAmount === "number"
    ? payment.metadata.originalAmount
    : tournament.entryFee;
  const finalAmount = typeof payment.metadata?.finalAmount === "number"
    ? payment.metadata.finalAmount
    : payment.amountInCents / 100;

  return {
    paymentId: payment._id,
    registrationId: registration._id,
    status: payment.status,
    alreadyProcessed: payment.status === PaymentTransactionStatus.APPROVED,
    ...(payment.expiresAt ? { paymentExpiresAt: payment.expiresAt.toISOString() } : {}),
    ...createWompiCheckoutConfig({
      reference: payment.reference,
      amountInCents: payment.amountInCents,
      currency: payment.currency,
      ...(payment.expiresAt ? { expirationTime: payment.expiresAt.toISOString() } : {}),
      redirectUrl,
      customerData: {
        email: payment.customerEmail ?? "",
        ...(payment.customerName ? { fullName: payment.customerName } : {}),
        ...(phoneData ?? {}),
      },
    }),
    tournament: {
      id: tournament._id,
      name: tournament.name,
      entryFee: tournament.entryFee,
      startDate: tournament.startDate,
      pricing: {
        type: pricingType,
        discountPercentage,
        originalAmount,
        finalAmount,
        ...(payment.expiresAt ? { validUntil: payment.expiresAt.toISOString() } : {}),
      },
    },
    registration: {
      id: registration._id,
      status: registration.status,
      playerCategory: registration.playerCategory,
      ...(registration.handicap !== undefined && { handicap: registration.handicap }),
    },
  };
}

export async function cleanupExpiredRaffleReservations(raffleId?: string) {
  const now = new Date();
  const filter: Record<string, unknown> = {
    status: TicketStatus.RESERVED,
    reservedUntil: { $lte: now },
  };

  if (raffleId) {
    filter.raffle = toObjectId(raffleId, "Raffle ID");
  }

  const expiredTickets = await RaffleTicket.find(filter)
    .select("_id")
    .lean();

  if (expiredTickets.length === 0) {
    return 0;
  }

  const ticketIds = expiredTickets.map((ticket) => ticket._id);

  await Promise.all([
    RaffleNumber.updateMany(
      {
        ticket: { $in: ticketIds },
        status: RaffleNumberStatus.RESERVED,
      },
      {
        $set: { status: RaffleNumberStatus.AVAILABLE },
        $unset: {
          user: "",
          ticket: "",
          reservedAt: "",
          paidAt: "",
        },
      },
    ),
    RaffleTicket.updateMany(
      { _id: { $in: ticketIds } },
      {
        $set: {
          status: TicketStatus.CANCELLED,
          paymentStatus: PaymentTransactionStatus.EXPIRED,
        },
        $unset: { reservedUntil: "" },
      },
    ),
    PaymentTransaction.updateMany(
      {
        payableType: PaymentPayableType.RAFFLE_TICKET,
        payableId: { $in: ticketIds },
        status: PaymentTransactionStatus.PENDING,
      },
      {
        $set: { status: PaymentTransactionStatus.EXPIRED },
      },
    ),
  ]);

  return ticketIds.length;
}

async function markReservedTicketAsPaid(ticketId: mongoose.Types.ObjectId, transactionId?: string) {
  const ticket = await RaffleTicket.findById(ticketId);
  if (!ticket) {
    throw new Error("Ticket no encontrado.");
  }

  if (ticket.status === TicketStatus.PAID || ticket.status === TicketStatus.WINNER) {
    return ticket;
  }

  if (ticket.status === TicketStatus.CANCELLED) {
    throw new Error("La reserva ya fue cancelada y no se puede aprobar.");
  }

  const now = new Date();

  await Promise.all([
    RaffleNumber.updateMany(
      {
        ticket: ticket._id,
        status: RaffleNumberStatus.RESERVED,
      },
      {
        $set: {
          status: RaffleNumberStatus.PAID,
          paidAt: now,
        },
      },
    ),
    Raffle.updateOne(
      { _id: ticket.raffle },
      { $inc: { soldTickets: ticket.numbers.length } },
    ),
    RaffleTicket.updateOne(
      { _id: ticket._id },
      {
        $set: {
          status: TicketStatus.PAID,
          paymentStatus: PaymentTransactionStatus.APPROVED,
          paidAt: now,
          ...(transactionId ? { paymentTransactionId: transactionId } : {}),
        },
        $unset: { reservedUntil: "" },
      },
    ),
  ]);

  return RaffleTicket.findById(ticket._id)
    .populate("user", "name avatarUrl")
    .populate("raffle", "name prize ticketPrice status drawDate")
    .lean();
}

async function cancelReservedTicket(ticketId: mongoose.Types.ObjectId, paymentStatus: PaymentTransactionStatus, transactionId?: string) {
  const ticket = await RaffleTicket.findById(ticketId);
  if (!ticket) {
    throw new Error("Ticket no encontrado.");
  }

  if (ticket.status === TicketStatus.PAID || ticket.status === TicketStatus.WINNER) {
    return ticket;
  }

  if (ticket.status === TicketStatus.CANCELLED) {
    return ticket;
  }

  await Promise.all([
    RaffleNumber.updateMany(
      {
        ticket: ticket._id,
        status: RaffleNumberStatus.RESERVED,
      },
      {
        $set: { status: RaffleNumberStatus.AVAILABLE },
        $unset: {
          user: "",
          ticket: "",
          reservedAt: "",
          paidAt: "",
        },
      },
    ),
    RaffleTicket.updateOne(
      { _id: ticket._id },
      {
        $set: {
          status: TicketStatus.CANCELLED,
          paymentStatus,
          ...(transactionId ? { paymentTransactionId: transactionId } : {}),
        },
        $unset: { reservedUntil: "" },
      },
    ),
  ]);

  return RaffleTicket.findById(ticket._id)
    .populate("user", "name avatarUrl")
    .populate("raffle", "name prize ticketPrice status drawDate")
    .lean();
}

export async function createWompiCheckoutForRaffle(
  raffleId: string,
  actor: ActorContext,
  params: CreateWompiCheckoutParams,
) {
  await cleanupExpiredRaffleReservations(raffleId);

  const raffleObjectId = toObjectId(raffleId, "Raffle ID");
  const raffle = await Raffle.findById(raffleObjectId)
    .select("_id name ticketPrice totalTickets status")
    .lean();

  if (!raffle) {
    throw new Error("Rifa no encontrada.");
  }

  if (raffle.status !== RaffleStatus.ACTIVE) {
    throw new Error("La rifa no está activa para recibir pagos.");
  }

  if (raffle.ticketPrice === 0) {
    throw new Error("La rifa es gratuita y no requiere checkout.");
  }

  if (!params.numbers || params.numbers.length === 0) {
    throw new Error("Debes enviar al menos un número.");
  }

  const targetUserId = params.userId ?? actor.id;
  if (params.userId && actor.role === UserRole.CUSTOMER && params.userId !== actor.id) {
    throw new Error("No puedes crear un checkout para otro usuario.");
  }

  const userObjectId = toObjectId(targetUserId, "User ID");
  const user = await User.findById(userObjectId)
    .select("name phone webAuth.email deletedAt playerCategory")
    .lean();

  if (!user || user.deletedAt) {
    throw new Error("Usuario no encontrado.");
  }

  if (user.playerCategory === PlayerCategory.SIN_DEFINIR) {
    throw new Error("La inscripción está pendiente de confirmación administrativa. Asigna la categoría del jugador antes de cobrar el torneo.");
  }

  const customerEmail = user.webAuth?.email?.trim();
  if (!customerEmail) {
    throw new Error("El usuario necesita un email para pagar con Wompi.");
  }

  const requestedNumbers = params.numbers.map((numberValue) => normalizeRaffleNumberInput(numberValue, raffle.totalTickets));
  const amountInCents = raffle.ticketPrice * requestedNumbers.length * 100;

  if (amountInCents <= 0) {
    throw new Error("El monto del checkout debe ser mayor a 0.");
  }

  const idempotencyKey = buildRaffleIdempotencyKey(targetUserId, raffleId, requestedNumbers);
  const existingPayment = await PaymentTransaction.findOne({
    provider: PaymentProvider.WOMPI,
    idempotencyKey,
  }).lean();

  const expirationDate = new Date(Date.now() + DEFAULT_RESERVATION_MINUTES * 60 * 1000);
  const paymentReference = generatePaymentReference("RAFFLE", raffleId);
  const redirectUrl = getWompiRedirectUrl("raffles");
  const phoneData = splitPhone(user.phone ?? null);
  const channel = getCheckoutChannel(params.channel);

  if (existingPayment) {
    if (
      existingPayment.status === PaymentTransactionStatus.PENDING ||
      existingPayment.status === PaymentTransactionStatus.APPROVED
    ) {
      const ticket = await RaffleTicket.findById(existingPayment.payableId)
        .select("_id numbers total")
        .lean();

      if (!ticket) {
        throw new Error("La transacción existente no tiene un ticket válido asociado.");
      }

      return getExistingRaffleResponseData(existingPayment, ticket, raffle);
    }

    if (!RETRYABLE_PAYMENT_STATUSES.has(existingPayment.status)) {
      throw new Error(`Ya existe una transacción previa para esta compra con estado ${existingPayment.status}.`);
    }

    const retryTicket = await RaffleTicket.create({
      raffle: raffleObjectId,
      user: userObjectId,
      numbers: requestedNumbers,
      status: TicketStatus.RESERVED,
      channel,
      isWinner: false,
      paymentProvider: PaymentProvider.WOMPI,
      paymentStatus: PaymentTransactionStatus.PENDING,
      paymentReference,
      reservedUntil: expirationDate,
    });

    try {
      await PaymentTransaction.updateOne(
        { _id: existingPayment._id },
        {
          $set: {
            payableId: retryTicket._id,
            reference: paymentReference,
            amountInCents,
            currency: "COP",
            status: PaymentTransactionStatus.PENDING,
            redirectUrl,
            expiresAt: expirationDate,
            externalTransactionId: undefined,
            providerMethod: undefined,
            customerEmail,
            customerName: user.name,
            customerPhone: user.phone,
            metadata: {
              raffleId,
              numbers: requestedNumbers,
              channel,
              retriedFromStatus: existingPayment.status,
            },
          },
        },
      );
    } catch (error) {
      await cancelReservedTicket(retryTicket._id, PaymentTransactionStatus.ERROR);
      throw error;
    }

    return {
      paymentId: existingPayment._id,
      ticketId: retryTicket._id,
      status: PaymentTransactionStatus.PENDING,
      reservationExpiresAt: expirationDate.toISOString(),
      ...createWompiCheckoutConfig({
        reference: paymentReference,
        amountInCents,
        currency: "COP",
        expirationTime: expirationDate.toISOString(),
        redirectUrl,
        customerData: {
          email: customerEmail,
          ...(user.name ? { fullName: user.name } : {}),
          ...(phoneData ?? {}),
        },
      }),
      raffle: {
        id: raffle._id,
        name: raffle.name,
        ticketPrice: raffle.ticketPrice,
        numbers: retryTicket.numbers,
        total: retryTicket.total,
      },
    };
  }

  const ticket = await RaffleTicket.create({
    raffle: raffleObjectId,
    user: userObjectId,
    numbers: requestedNumbers,
    status: TicketStatus.RESERVED,
    channel,
    isWinner: false,
    paymentProvider: PaymentProvider.WOMPI,
    paymentStatus: PaymentTransactionStatus.PENDING,
    paymentReference,
    reservedUntil: expirationDate,
  });

  const paymentData: Record<string, unknown> = {
    user: userObjectId,
    provider: PaymentProvider.WOMPI,
    payableType: PaymentPayableType.RAFFLE_TICKET,
    payableId: ticket._id,
    idempotencyKey,
    reference: paymentReference,
    amountInCents,
    currency: "COP",
    status: PaymentTransactionStatus.PENDING,
    redirectUrl,
    expiresAt: expirationDate,
    customerEmail,
    customerName: user.name,
    metadata: {
      raffleId,
      numbers: requestedNumbers,
      channel,
    },
  };

  if (user.phone) {
    paymentData.customerPhone = user.phone;
  }

  const payment = await PaymentTransaction.create(paymentData);

  return {
    paymentId: payment._id,
    ticketId: ticket._id,
    status: payment.status,
    reservationExpiresAt: expirationDate.toISOString(),
    ...createWompiCheckoutConfig({
      reference: paymentReference,
      amountInCents,
      currency: "COP",
      expirationTime: expirationDate.toISOString(),
      redirectUrl,
      customerData: {
        email: customerEmail,
        ...(user.name ? { fullName: user.name } : {}),
        ...(phoneData ?? {}),
      },
    }),
    raffle: {
      id: raffle._id,
      name: raffle.name,
      ticketPrice: raffle.ticketPrice,
      numbers: ticket.numbers,
      total: ticket.total,
    },
  };
}

export async function createWompiCheckoutForTournament(
  tournamentId: string,
  actor: ActorContext,
  params: CreateTournamentWompiCheckoutParams,
) {
  if (actor.role === UserRole.CUSTOMER && params.handicap !== undefined) {
    throw new Error("El handicap solo puede ser asignado por un administrador o staff.");
  }

  const tournamentObjectId = toObjectId(tournamentId, "Tournament ID");
  const tournament = await Tournament.findById(tournamentObjectId)
    .select("_id name entryFee status registrationDeadline currentParticipants maxParticipants startDate discount20Deadline discount10Deadline")
    .lean();

  if (!tournament) {
    throw new Error("Torneo no encontrado.");
  }

  if (tournament.status !== TournamentStatus.OPEN) {
    throw new Error("El torneo no tiene inscripciones abiertas.");
  }

  if (new Date() > tournament.registrationDeadline) {
    throw new Error("La fecha límite de inscripción ya venció.");
  }

  if (tournament.entryFee <= 0) {
    throw new Error("El torneo es gratuito y no requiere checkout.");
  }

  const pricing = resolveTournamentCheckoutPricing(tournament);

  const targetUserId = params.userId ?? actor.id;
  if (params.userId && actor.role === UserRole.CUSTOMER && params.userId !== actor.id) {
    throw new Error("No puedes crear un checkout para otro usuario.");
  }

  const userObjectId = toObjectId(targetUserId, "User ID");
  await ensureTournamentRegistrantIdentityDocument(targetUserId);

  const user = await User.findById(userObjectId)
    .select("name phone webAuth.email deletedAt")
    .lean();

  if (!user || user.deletedAt) {
    throw new Error("Usuario no encontrado.");
  }

  const customerEmail = user.webAuth?.email?.trim();
  if (!customerEmail) {
    throw new Error("El usuario necesita un email para pagar con Wompi.");
  }

  let registration = await TournamentRegistration.findOne({
    tournament: tournamentObjectId,
    user: userObjectId,
  })
    .select("_id status playerCategory handicap")
    .lean();

  if (registration?.status === RegistrationStatus.CANCELLED) {
    registration = null;
  }

  if (!registration) {
    const createdRegistration = await selfRegisterToTournamentService(
      tournamentId,
      targetUserId,
      {
        ...(params.playerCategory !== undefined && { playerCategory: params.playerCategory }),
        ...(params.handicap !== undefined && { handicap: params.handicap }),
        ...(params.channel !== undefined && { channel: params.channel }),
        ...(params.notes !== undefined && { notes: params.notes }),
      },
    );

    registration = await TournamentRegistration.findById(createdRegistration._id)
      .select("_id status playerCategory handicap")
      .lean();
  }

  if (!registration) {
    throw new Error("No fue posible preparar la inscripción del torneo.");
  }

  if (registration.status === RegistrationStatus.CONFIRMED) {
    throw new Error("La inscripción de este jugador ya está confirmada.");
  }

  if (registration.status === RegistrationStatus.CANCELLED) {
    throw new Error("La inscripción fue cancelada y no admite pago.");
  }

  const amountInCents = pricing.amountInCents;
  if (amountInCents <= 0) {
    throw new Error("El monto del checkout debe ser mayor a 0.");
  }

  const idempotencyKey = buildTournamentIdempotencyKey(targetUserId, tournamentId);
  const existingPayment = await PaymentTransaction.findOne({
    provider: PaymentProvider.WOMPI,
    idempotencyKey,
  }).lean();

  const paymentReference = generatePaymentReference("TOURNAMENT", tournamentId);
  const redirectUrl = getWompiRedirectUrl("tournaments");
  const phoneData = splitPhone(user.phone ?? null);
  const channel = getCheckoutChannel(params.channel);
  const now = Date.now();

  if (existingPayment) {
    if (existingPayment.status === PaymentTransactionStatus.APPROVED) {
      return getExistingTournamentResponseData(existingPayment, registration, tournament);
    }

    if (existingPayment.status === PaymentTransactionStatus.PENDING) {
      const isStillValid = existingPayment.expiresAt
        ? existingPayment.expiresAt.getTime() > now
        : false;

      if (isStillValid) {
        return getExistingTournamentResponseData(existingPayment, registration, tournament);
      }
    }

    if (
      existingPayment.status !== PaymentTransactionStatus.PENDING &&
      !RETRYABLE_PAYMENT_STATUSES.has(existingPayment.status)
    ) {
      throw new Error(`Ya existe una transacción previa para esta inscripción con estado ${existingPayment.status}.`);
    }

    await PaymentTransaction.updateOne(
      { _id: existingPayment._id },
      {
        $set: {
          payableId: registration._id,
          reference: paymentReference,
          amountInCents,
          currency: "COP",
          status: PaymentTransactionStatus.PENDING,
          redirectUrl,
          expiresAt: pricing.expiresAt,
          externalTransactionId: undefined,
          providerMethod: undefined,
          customerEmail,
          customerName: user.name,
          customerPhone: user.phone,
          metadata: {
            tournamentId,
            registrationId: registration._id.toString(),
            channel,
            pricingType: pricing.pricingType,
            discountPercentage: pricing.discountPercentage,
            originalAmount: pricing.originalAmount,
            finalAmount: pricing.finalAmount,
            retriedFromStatus: existingPayment.status,
          },
        },
      },
    );

    return {
      paymentId: existingPayment._id,
      registrationId: registration._id,
      status: PaymentTransactionStatus.PENDING,
      paymentExpiresAt: pricing.expiresAt.toISOString(),
      ...createWompiCheckoutConfig({
        reference: paymentReference,
        amountInCents,
        currency: "COP",
        expirationTime: pricing.expiresAt.toISOString(),
        redirectUrl,
        customerData: {
          email: customerEmail,
          ...(user.name ? { fullName: user.name } : {}),
          ...(phoneData ?? {}),
        },
      }),
      tournament: {
        id: tournament._id,
        name: tournament.name,
        entryFee: tournament.entryFee,
        startDate: tournament.startDate,
        pricing: {
          type: pricing.pricingType,
          discountPercentage: pricing.discountPercentage,
          originalAmount: pricing.originalAmount,
          finalAmount: pricing.finalAmount,
          validUntil: pricing.expiresAt.toISOString(),
        },
      },
      registration: {
        id: registration._id,
        status: registration.status,
        playerCategory: registration.playerCategory,
        ...(registration.handicap !== undefined && { handicap: registration.handicap }),
      },
    };
  }

  const paymentData: Record<string, unknown> = {
    user: userObjectId,
    provider: PaymentProvider.WOMPI,
    payableType: PaymentPayableType.TOURNAMENT_REGISTRATION,
    payableId: registration._id,
    idempotencyKey,
    reference: paymentReference,
    amountInCents,
    currency: "COP",
    status: PaymentTransactionStatus.PENDING,
    redirectUrl,
    expiresAt: pricing.expiresAt,
    customerEmail,
    metadata: {
      tournamentId,
      registrationId: registration._id.toString(),
      channel,
      pricingType: pricing.pricingType,
      discountPercentage: pricing.discountPercentage,
      originalAmount: pricing.originalAmount,
      finalAmount: pricing.finalAmount,
    },
  };

  if (user.name) {
    paymentData.customerName = user.name;
  }

  if (user.phone) {
    paymentData.customerPhone = user.phone;
  }

  const payment = await PaymentTransaction.create(paymentData);

  return {
    paymentId: payment._id,
    registrationId: registration._id,
    status: payment.status,
    paymentExpiresAt: pricing.expiresAt.toISOString(),
    ...createWompiCheckoutConfig({
      reference: paymentReference,
      amountInCents,
      currency: "COP",
      expirationTime: pricing.expiresAt.toISOString(),
      redirectUrl,
      customerData: {
        email: customerEmail,
        ...(user.name ? { fullName: user.name } : {}),
        ...(phoneData ?? {}),
      },
    }),
    tournament: {
      id: tournament._id,
      name: tournament.name,
      entryFee: tournament.entryFee,
      startDate: tournament.startDate,
      pricing: {
        type: pricing.pricingType,
        discountPercentage: pricing.discountPercentage,
        originalAmount: pricing.originalAmount,
        finalAmount: pricing.finalAmount,
        validUntil: pricing.expiresAt.toISOString(),
      },
    },
    registration: {
      id: registration._id,
      status: registration.status,
      playerCategory: registration.playerCategory,
      ...(registration.handicap !== undefined && { handicap: registration.handicap }),
    },
  };
}

async function handleRafflePaymentStatus(
  payment: {
    _id: mongoose.Types.ObjectId;
    payableId: mongoose.Types.ObjectId;
    expiresAt?: Date;
  },
  status: PaymentTransactionStatus,
  transactionId?: string,
) {
  if (status === PaymentTransactionStatus.APPROVED) {
    const ticket = await RaffleTicket.findById(payment.payableId)
      .select("_id status reservedUntil")
      .lean();

    if (!ticket) {
      throw new Error("Ticket no encontrado.");
    }

    const now = Date.now();
    const paymentExpired = payment.expiresAt ? payment.expiresAt.getTime() <= now : false;
    const reservationExpired = ticket.reservedUntil ? ticket.reservedUntil.getTime() <= now : false;
    const ticketUnavailable = ticket.status === TicketStatus.CANCELLED;

    if (paymentExpired || reservationExpired || ticketUnavailable) {
      await PaymentTransaction.updateOne(
        { _id: payment._id },
        {
          $set: {
            status: PaymentTransactionStatus.EXPIRED,
            ...(transactionId ? { externalTransactionId: transactionId } : {}),
            metadata: {
              lateApprovalBlocked: true,
              blockedAt: new Date().toISOString(),
              previousReservationExpired: paymentExpired || reservationExpired,
              ticketStatus: ticket.status,
            },
          },
        },
      );

      return {
        ok: true,
        ignored: true,
        reason: "Pago aprobado fuera del tiempo de reserva. No se asignaron números.",
      };
    }

    return markReservedTicketAsPaid(payment.payableId, transactionId);
  }

  if ([
    PaymentTransactionStatus.DECLINED,
    PaymentTransactionStatus.VOIDED,
    PaymentTransactionStatus.ERROR,
    PaymentTransactionStatus.EXPIRED,
  ].includes(status)) {
    return cancelReservedTicket(payment.payableId, status, transactionId);
  }

  await RaffleTicket.updateOne(
    { _id: payment.payableId },
    {
      $set: {
        paymentStatus: status,
        ...(transactionId ? { paymentTransactionId: transactionId } : {}),
      },
    },
  );

  return null;
}

async function handleTournamentRegistrationPaymentStatus(
  payment: {
    _id: mongoose.Types.ObjectId;
    payableId: mongoose.Types.ObjectId;
    expiresAt?: Date;
  },
  status: PaymentTransactionStatus,
  transaction: {
    id?: string;
    reference?: string;
    payment_method_type?: string;
  },
) {
  const registration = await TournamentRegistration.findById(payment.payableId)
    .select("_id tournament status paymentMethod paymentReference paidAt")
    .lean();

  if (!registration) {
    throw new Error("Inscripción de torneo no encontrada.");
  }

  const cancelPendingRegistration = async () => {
    await TournamentRegistration.updateOne(
      { _id: registration._id, status: { $ne: RegistrationStatus.CONFIRMED } },
      {
        $set: {
          status: RegistrationStatus.CANCELLED,
          ...(transaction.reference ? { paymentReference: transaction.reference } : {}),
        },
        $unset: {
          paymentMethod: "",
          paidAt: "",
        },
      },
    );

    return TournamentRegistration.findById(registration._id)
      .populate("user", "name phone avatarUrl")
      .populate("tournament", "name entryFee startDate")
      .lean();
  };

  if (status === PaymentTransactionStatus.APPROVED) {
    if (registration.status === RegistrationStatus.CONFIRMED) {
      return registration;
    }

    if (payment.expiresAt && payment.expiresAt.getTime() <= Date.now()) {
      await PaymentTransaction.updateOne(
        { _id: payment._id },
        {
          $set: {
            status: PaymentTransactionStatus.EXPIRED,
            metadata: {
              lateApprovalBlocked: true,
              blockedAt: new Date().toISOString(),
              reason: "El checkout de esta inscripción ya estaba vencido.",
            },
          },
        },
      );

      await cancelPendingRegistration();

      return {
        ok: true,
        ignored: true,
        reason: "Pago aprobado fuera de la ventana permitida. La inscripción no fue confirmada.",
      };
    }

    const tournament = await Tournament.findById(registration.tournament)
      .select("_id status currentParticipants maxParticipants")
      .lean();

    if (!tournament) {
      throw new Error("Torneo no encontrado.");
    }

    if (tournament.status !== TournamentStatus.OPEN && tournament.status !== TournamentStatus.CLOSED) {
      await PaymentTransaction.updateOne(
        { _id: payment._id },
        {
          $set: {
            status: PaymentTransactionStatus.ERROR,
            metadata: {
              registrationBlocked: true,
              blockedAt: new Date().toISOString(),
              reason: `Tournament status ${tournament.status} no permite confirmar la inscripción.`,
            },
          },
        },
      );

      return {
        ok: true,
        ignored: true,
        reason: "Pago aprobado pero el torneo ya no admite confirmación automática.",
      };
    }

    const seatReserved = await Tournament.updateOne(
      {
        _id: tournament._id,
        currentParticipants: { $lt: tournament.maxParticipants },
      },
      { $inc: { currentParticipants: 1 } },
    );

    if (seatReserved.modifiedCount === 0) {
      await PaymentTransaction.updateOne(
        { _id: payment._id },
        {
          $set: {
            status: PaymentTransactionStatus.ERROR,
            metadata: {
              registrationBlocked: true,
              blockedAt: new Date().toISOString(),
              reason: "El torneo ya no tiene cupos disponibles para confirmar la inscripción.",
            },
          },
        },
      );

      return {
        ok: true,
        ignored: true,
        reason: "Pago aprobado pero el torneo ya no tiene cupos disponibles.",
      };
    }

    const paymentMethod = mapWompiProviderMethodToPaymentMethod(transaction.payment_method_type);
    const paidAt = new Date();

    await TournamentRegistration.updateOne(
      { _id: registration._id },
      {
        $set: {
          status: RegistrationStatus.CONFIRMED,
          paidAt,
          ...(transaction.reference ? { paymentReference: transaction.reference } : {}),
          ...(paymentMethod ? { paymentMethod } : {}),
        },
      },
    );

    return TournamentRegistration.findById(registration._id)
      .populate("user", "name phone avatarUrl")
      .populate("tournament", "name entryFee startDate")
      .lean();
  }

  if (status === PaymentTransactionStatus.EXPIRED) {
    return cancelPendingRegistration();
  }

  if ([
    PaymentTransactionStatus.DECLINED,
    PaymentTransactionStatus.VOIDED,
    PaymentTransactionStatus.ERROR,
  ].includes(status)) {
    await TournamentRegistration.updateOne(
      { _id: registration._id, status: { $ne: RegistrationStatus.CONFIRMED } },
      {
        $set: {
          status: RegistrationStatus.PENDING,
          ...(transaction.reference ? { paymentReference: transaction.reference } : {}),
        },
      },
    );

    return TournamentRegistration.findById(registration._id)
      .populate("user", "name phone avatarUrl")
      .populate("tournament", "name entryFee startDate")
      .lean();
  }

  return null;
}

export async function handleWompiWebhook(payload: WompiEventPayload, headerChecksum?: string | string[]) {
  const isValid = verifyWompiEvent(payload, headerChecksum);
  if (!isValid) {
    throw new Error("Checksum de Wompi inválido.");
  }

  if (payload.event !== "transaction.updated") {
    return { ok: true, ignored: true, reason: "Evento no manejado." };
  }

  const transaction = payload.data?.transaction;
  if (!transaction?.reference) {
    throw new Error("El evento no contiene referencia de transacción.");
  }

  const payment = await PaymentTransaction.findOne({
    provider: PaymentProvider.WOMPI,
    reference: transaction.reference,
  }).lean();

  if (!payment) {
    return { ok: true, ignored: true, reason: "No existe transacción interna para la referencia recibida." };
  }

  if (typeof transaction.amount_in_cents === "number" && transaction.amount_in_cents !== payment.amountInCents) {
    throw new Error("El monto reportado por Wompi no coincide con la transacción interna.");
  }

  const status = normalizeWompiTransactionStatus(transaction.status);

  await PaymentTransaction.updateOne(
    { _id: payment._id },
    {
      $set: {
        status,
        ...(transaction.id ? { externalTransactionId: transaction.id } : {}),
        ...(transaction.payment_method_type ? { providerMethod: transaction.payment_method_type } : {}),
      },
    },
  );

  switch (payment.payableType) {
    case PaymentPayableType.RAFFLE_TICKET: {
      const data = await handleRafflePaymentStatus(payment, status, transaction.id);
      return {
        ok: true,
        processed: data !== null,
        status,
        ...(data ? { data } : {}),
      };
    }
    case PaymentPayableType.TOURNAMENT_REGISTRATION: {
      const data = await handleTournamentRegistrationPaymentStatus(payment, status, transaction);
      return {
        ok: true,
        processed: data !== null,
        status,
        ...(data ? { data } : {}),
      };
    }
    default:
      return { ok: true, ignored: true, reason: `Tipo de pago no soportado todavía: ${payment.payableType}.` };
  }
}
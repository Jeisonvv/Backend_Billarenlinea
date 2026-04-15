import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import PaymentTransaction from "../models/payment-transaction.model.js";
import Raffle from "../models/raffle.model.js";
import RaffleNumber, { normalizeRaffleNumberInput } from "../models/raffle-number.model.js";
import RaffleTicket from "../models/raffle-ticket.model.js";
import User from "../models/user.model.js";
import {
  Channel,
  PaymentPayableType,
  PaymentProvider,
  PaymentTransactionStatus,
  RaffleNumberStatus,
  RaffleStatus,
  TicketStatus,
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

interface ActorContext {
  id: string;
  role: UserRole;
}

interface CreateWompiCheckoutParams {
  userId?: string;
  numbers: Array<string | number>;
  channel?: string;
}

const DEFAULT_RESERVATION_MINUTES = Number(process.env.RAFFLE_RESERVATION_MINUTES ?? 15);

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
  const redirectUrl = payment.redirectUrl ?? getWompiRedirectUrl();

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
    .select("name phone webAuth.email deletedAt")
    .lean();

  if (!user || user.deletedAt) {
    throw new Error("Usuario no encontrado.");
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

  if (existingPayment) {
    if (
      existingPayment.status !== PaymentTransactionStatus.PENDING &&
      existingPayment.status !== PaymentTransactionStatus.APPROVED
    ) {
      throw new Error(`Ya existe una transacción previa para esta compra con estado ${existingPayment.status}.`);
    }

    const ticket = await RaffleTicket.findById(existingPayment.payableId)
      .select("_id numbers total")
      .lean();

    if (!ticket) {
      throw new Error("La transacción existente no tiene un ticket válido asociado.");
    }

    return getExistingRaffleResponseData(existingPayment, ticket, raffle);
  }

  const expirationDate = new Date(Date.now() + DEFAULT_RESERVATION_MINUTES * 60 * 1000);
  const paymentReference = generatePaymentReference("RAFFLE", raffleId);
  const redirectUrl = getWompiRedirectUrl();
  const phoneData = splitPhone(user.phone ?? null);
  const channel = getCheckoutChannel(params.channel);

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

async function handleRafflePaymentStatus(
  payment: {
    payableId: mongoose.Types.ObjectId;
  },
  status: PaymentTransactionStatus,
  transactionId?: string,
) {
  if (status === PaymentTransactionStatus.APPROVED) {
    return markReservedTicketAsPaid(payment.payableId, transactionId);
  }

  if ([PaymentTransactionStatus.DECLINED, PaymentTransactionStatus.VOIDED, PaymentTransactionStatus.ERROR].includes(status)) {
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
    default:
      return { ok: true, ignored: true, reason: `Tipo de pago no soportado todavía: ${payment.payableType}.` };
  }
}
import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import Raffle from "../models/raffle.model.ts";
import RaffleNumber from "../models/raffle-number.model.ts";
import RaffleTicket from "../models/raffle-ticket.model.ts";
import User from "../models/user.model.ts";
import {
  Channel,
  PaymentProvider,
  PaymentTransactionStatus,
  RaffleNumberStatus,
  RaffleStatus,
  TicketStatus,
  UserRole,
} from "../models/enums.ts";

interface ActorContext {
  id: string;
  role: UserRole;
}

interface CreateWompiCheckoutParams {
  userId?: string;
  numbers: Array<string | number>;
  channel?: string;
}

interface WompiEventPayload {
  event?: string;
  data?: {
    transaction?: {
      id?: string;
      reference?: string;
      status?: string;
      amount_in_cents?: number;
      payment_method_type?: string;
      customer_email?: string;
    };
  };
  signature?: {
    properties?: string[];
    checksum?: string;
  };
  timestamp?: number;
}

const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY?.trim();
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET?.trim();
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET?.trim();
const WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/";
const WOMPI_WIDGET_URL = "https://checkout.wompi.co/widget.js";
const DEFAULT_RESERVATION_MINUTES = Number(process.env.RAFFLE_RESERVATION_MINUTES ?? 15);

function toObjectId(id: string, fieldName: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`${fieldName} inválido.`);
  }

  return new mongoose.Types.ObjectId(id);
}

function requireWompiConfig() {
  if (!WOMPI_PUBLIC_KEY || !WOMPI_INTEGRITY_SECRET) {
    throw new Error("Wompi no está configurado. Revisa WOMPI_PUBLIC_KEY y WOMPI_INTEGRITY_SECRET.");
  }

  return {
    publicKey: WOMPI_PUBLIC_KEY,
    integritySecret: WOMPI_INTEGRITY_SECRET,
  };
}

function getWompiRedirectUrl() {
  const explicit = process.env.WOMPI_REDIRECT_URL?.trim();
  if (explicit) return explicit;

  const frontend = process.env.FRONTEND_URL?.trim() ?? process.env.ALLOWED_ORIGINS?.split(",")[0]?.trim();
  if (!frontend) {
    throw new Error("No se encontró WOMPI_REDIRECT_URL ni FRONTEND_URL para redirección de pagos.");
  }

  return new URL("/payments/wompi", frontend).toString();
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildIntegritySignature(reference: string, amountInCents: number, currency: string, expirationTime: string) {
  const { integritySecret } = requireWompiConfig();
  return sha256Hex(`${reference}${amountInCents}${currency}${expirationTime}${integritySecret}`);
}

function generatePaymentReference(raffleId: string) {
  return `RAFFLE-${raffleId.slice(-6)}-${Date.now()}-${randomBytes(4).toString("hex")}`.toUpperCase();
}

function getValueFromPath(data: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return "";
  }, data);
}

function normalizeWebhookStatus(status?: string) {
  switch (status) {
    case PaymentTransactionStatus.APPROVED:
      return PaymentTransactionStatus.APPROVED;
    case PaymentTransactionStatus.DECLINED:
      return PaymentTransactionStatus.DECLINED;
    case PaymentTransactionStatus.VOIDED:
      return PaymentTransactionStatus.VOIDED;
    case PaymentTransactionStatus.ERROR:
      return PaymentTransactionStatus.ERROR;
    default:
      return PaymentTransactionStatus.PENDING;
  }
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
        $set: { status: TicketStatus.CANCELLED },
        $unset: { reservedUntil: "" },
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
  const { publicKey } = requireWompiConfig();
  await cleanupExpiredRaffleReservations(raffleId);

  const raffleObjectId = toObjectId(raffleId, "Raffle ID");
  const raffle = await Raffle.findById(raffleObjectId);
  if (!raffle) {
    throw new Error("Rifa no encontrada.");
  }

  if (raffle.status !== RaffleStatus.ACTIVE) {
    throw new Error("La rifa no está activa para recibir pagos.");
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

  const expirationTime = new Date(Date.now() + DEFAULT_RESERVATION_MINUTES * 60 * 1000).toISOString();
  const paymentReference = generatePaymentReference(raffleId);
  const requestedNumbers = params.numbers.map((numberValue) => String(numberValue));
  const amountInCents = raffle.ticketPrice * requestedNumbers.length * 100;
  const redirectUrl = getWompiRedirectUrl();
  const integrity = buildIntegritySignature(paymentReference, amountInCents, "COP", expirationTime);
  const phoneData = splitPhone(user.phone ?? null);

  const ticket = await RaffleTicket.create({
    raffle: raffleObjectId,
    user: userObjectId,
    numbers: requestedNumbers,
    status: TicketStatus.RESERVED,
    channel: Channel.WEB,
    isWinner: false,
    paymentProvider: PaymentProvider.WOMPI,
    paymentStatus: PaymentTransactionStatus.PENDING,
    paymentReference,
    reservedUntil: new Date(expirationTime),
  });

  return {
    ticketId: ticket._id,
    paymentProvider: PaymentProvider.WOMPI,
    reference: paymentReference,
    amountInCents,
    currency: "COP",
    expirationTime,
    redirectUrl,
    checkoutUrl: WOMPI_CHECKOUT_URL,
    widgetUrl: WOMPI_WIDGET_URL,
    publicKey,
    signature: {
      integrity,
    },
    customerData: {
      email: customerEmail,
      fullName: user.name,
      ...(phoneData ?? {}),
    },
    raffle: {
      id: raffle._id,
      name: raffle.name,
      ticketPrice: raffle.ticketPrice,
      numbers: ticket.numbers,
      total: ticket.total,
    },
  };
}

export function verifyWompiEvent(payload: WompiEventPayload, headerChecksum?: string | string[]) {
  if (!WOMPI_EVENTS_SECRET) {
    throw new Error("WOMPI_EVENTS_SECRET no está configurado.");
  }

  const properties = payload.signature?.properties ?? [];
  const checksum = (Array.isArray(headerChecksum) ? headerChecksum[0] : headerChecksum) ?? payload.signature?.checksum;
  if (!checksum) {
    throw new Error("El evento de Wompi no trae checksum.");
  }

  const baseData = (payload.data ?? {}) as Record<string, unknown>;
  const values = properties.map((property) => String(getValueFromPath(baseData, property))).join("");
  const calculated = sha256Hex(`${values}${payload.timestamp ?? ""}${WOMPI_EVENTS_SECRET}`).toUpperCase();

  return calculated === checksum.toUpperCase();
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

  const ticket = await RaffleTicket.findOne({
    paymentReference: transaction.reference,
    paymentProvider: PaymentProvider.WOMPI,
  });

  if (!ticket) {
    return { ok: true, ignored: true, reason: "No existe ticket para la referencia recibida." };
  }

  if (typeof transaction.amount_in_cents === "number" && transaction.amount_in_cents !== ticket.total * 100) {
    throw new Error("El monto reportado por Wompi no coincide con la reserva.");
  }

  const status = normalizeWebhookStatus(transaction.status);

  if (status === PaymentTransactionStatus.APPROVED) {
    const data = await markReservedTicketAsPaid(ticket._id, transaction.id);
    return { ok: true, processed: true, status, data };
  }

  if ([PaymentTransactionStatus.DECLINED, PaymentTransactionStatus.VOIDED, PaymentTransactionStatus.ERROR].includes(status)) {
    const data = await cancelReservedTicket(ticket._id, status, transaction.id);
    return { ok: true, processed: true, status, data };
  }

  await RaffleTicket.updateOne(
    { _id: ticket._id },
    {
      $set: {
        paymentStatus: status,
        ...(transaction.id ? { paymentTransactionId: transaction.id } : {}),
      },
    },
  );

  return { ok: true, processed: false, status };
}
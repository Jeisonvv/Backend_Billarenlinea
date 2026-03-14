import mongoose from "mongoose";
import Raffle from "../models/raffle.model.ts";
import RaffleNumber from "../models/raffle-number.model.ts";
import RaffleTicket from "../models/raffle-ticket.model.ts";
import User from "../models/user.model.ts";
import { Channel, PaymentMethod, RaffleNumberStatus, RaffleStatus, TicketStatus, UserRole } from "../models/enums.ts";

export interface ListRafflesParams {
  status?: string;
  page: number;
  limit: number;
}

interface PurchaseRaffleTicketsParams {
  userId?: string;
  numbers: Array<string | number>;
  channel?: string;
  paymentMethod?: string;
  paymentReference?: string;
  status?: string;
}

interface ActorContext {
  id: string;
  role: UserRole;
}

function toObjectId(id: string, fieldName: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`${fieldName} inválido.`);
  }

  return new mongoose.Types.ObjectId(id);
}

function getTicketStatus(inputStatus?: TicketStatus) {
  if (!inputStatus) return TicketStatus.RESERVED;

  if (inputStatus !== TicketStatus.RESERVED && inputStatus !== TicketStatus.PAID) {
    throw new Error("Solo se permite crear boletos RESERVED o PAID.");
  }

  return inputStatus;
}

function getPurchaseChannel(inputChannel?: string) {
  if (!inputChannel) return Channel.WEB;

  if (!Object.values(Channel).includes(inputChannel as Channel)) {
    throw new Error("Canal de compra inválido.");
  }

  return inputChannel as Channel;
}

function getPaymentMethod(inputMethod?: string) {
  if (!inputMethod) return undefined;

  if (!Object.values(PaymentMethod).includes(inputMethod as PaymentMethod)) {
    throw new Error("Método de pago inválido.");
  }

  return inputMethod as PaymentMethod;
}

export async function createRaffleService(data: Record<string, unknown>, createdBy: string) {
  const createdById = toObjectId(createdBy, "createdBy");
  return Raffle.create({
    ...data,
    createdBy: createdById,
    soldTickets: 0,
  });
}

export async function listRafflesService(params: ListRafflesParams) {
  const { status, page, limit } = params;
  const filter: Record<string, unknown> = {};

  if (status) {
    filter.status = status;
  }

  const skip = (page - 1) * limit;
  const [raffles, total] = await Promise.all([
    Raffle.find(filter)
      .populate("winner", "name")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Raffle.countDocuments(filter),
  ]);

  return { raffles, total };
}

export async function getRaffleByIdService(id: string) {
  const raffleId = toObjectId(id, "Raffle ID");

  const raffle = await Raffle.findById(raffleId)
    .populate("winner", "name avatarUrl")
    .populate("createdBy", "name avatarUrl")
    .lean({ virtuals: true });

  if (!raffle) {
    throw new Error("Rifa no encontrada.");
  }

  const [availableCount, reservedCount, paidCount, winnerCount] = await Promise.all([
    RaffleNumber.countDocuments({ raffle: raffleId, status: RaffleNumberStatus.AVAILABLE }),
    RaffleNumber.countDocuments({ raffle: raffleId, status: RaffleNumberStatus.RESERVED }),
    RaffleNumber.countDocuments({ raffle: raffleId, status: RaffleNumberStatus.PAID }),
    RaffleNumber.countDocuments({ raffle: raffleId, status: RaffleNumberStatus.WINNER }),
  ]);

  return {
    ...raffle,
    numberSummary: {
      available: availableCount,
      reserved: reservedCount,
      paid: paidCount,
      winner: winnerCount,
    },
  };
}

export async function getRaffleNumbersService(
  id: string,
  options: { status?: string; page: number; limit: number },
) {
  const raffleId = toObjectId(id, "Raffle ID");
  const raffle = await Raffle.findById(raffleId).select("_id totalTickets").lean();

  if (!raffle) {
    throw new Error("Rifa no encontrada.");
  }

  const filter: Record<string, unknown> = { raffle: raffleId };
  if (options.status) {
    filter.status = options.status;
  }

  const skip = (options.page - 1) * options.limit;
  const [numbers, total] = await Promise.all([
    RaffleNumber.find(filter)
      .sort({ numericValue: 1 })
      .skip(skip)
      .limit(options.limit)
      .lean(),
    RaffleNumber.countDocuments(filter),
  ]);

  return {
    raffleId: raffle._id,
    totalTickets: raffle.totalTickets,
    total,
    page: options.page,
    limit: options.limit,
    numbers,
  };
}

export async function getAvailableRaffleNumbersService(id: string) {
  const raffleId = toObjectId(id, "Raffle ID");
  const raffle = await Raffle.findById(raffleId).select("_id totalTickets").lean();

  if (!raffle) {
    throw new Error("Rifa no encontrada.");
  }

  const numbers = await RaffleNumber.findAvailableByRaffle(raffleId);

  return {
    raffleId: raffle._id,
    totalTickets: raffle.totalTickets,
    availableCount: numbers.length,
    numbers,
  };
}

export async function purchaseRaffleTicketsService(
  raffleId: string,
  actor: ActorContext,
  params: PurchaseRaffleTicketsParams,
) {
  const raffleObjectId = toObjectId(raffleId, "Raffle ID");
  const raffle = await Raffle.findById(raffleObjectId);

  if (!raffle) {
    throw new Error("Rifa no encontrada.");
  }

  if (raffle.status !== RaffleStatus.ACTIVE) {
    throw new Error("La rifa no está activa para venta de boletos.");
  }

  if (!params.numbers || params.numbers.length === 0) {
    throw new Error("Debes enviar al menos un número.");
  }

  const targetUserId = params.userId ?? actor.id;
  if (params.userId && actor.role === UserRole.CUSTOMER && params.userId !== actor.id) {
    throw new Error("No puedes comprar boletos para otro usuario.");
  }

  const userObjectId = toObjectId(targetUserId, "User ID");
  const user = await User.findById(userObjectId).select("_id deletedAt").lean();
  if (!user || user.deletedAt) {
    throw new Error("Usuario no encontrado.");
  }

  const status = getTicketStatus(params.status as TicketStatus | undefined);
  const channel = getPurchaseChannel(params.channel);
  const paymentMethod = getPaymentMethod(params.paymentMethod);

  if (status === TicketStatus.PAID && actor.role === UserRole.CUSTOMER) {
    throw new Error("Un cliente no puede marcar una compra como pagada desde este endpoint.");
  }

  const ticketData: Record<string, unknown> = {
    raffle: raffleObjectId,
    user: userObjectId,
    numbers: params.numbers,
    status,
    channel,
    isWinner: false,
  };

  if (paymentMethod) ticketData.paymentMethod = paymentMethod;
  if (params.paymentReference) ticketData.paymentReference = params.paymentReference;

  const ticket = await RaffleTicket.create(ticketData);

  return RaffleTicket.findById(ticket._id)
    .populate("user", "name avatarUrl")
    .populate("raffle", "name prize ticketPrice status drawDate")
    .lean();
}

export async function drawRaffleService(id: string) {
  const raffleId = toObjectId(id, "Raffle ID");
  const raffle = await Raffle.findById(raffleId);

  if (!raffle) {
    throw new Error("Rifa no encontrada.");
  }

  if (raffle.status === RaffleStatus.DRAWN) {
    throw new Error("La rifa ya fue sorteada.");
  }

  if (raffle.status === RaffleStatus.CANCELLED || raffle.status === RaffleStatus.DRAFT) {
    throw new Error("La rifa no está en un estado válido para sorteo.");
  }

  const paidNumbers = await RaffleNumber.find({
    raffle: raffleId,
    status: RaffleNumberStatus.PAID,
  }).lean();

  if (paidNumbers.length === 0) {
    throw new Error("No hay números pagados para sortear.");
  }

  const winner = paidNumbers[Math.floor(Math.random() * paidNumbers.length)];
  if (!winner) {
    throw new Error("No fue posible elegir un número ganador.");
  }

  if (!winner.ticket) {
    throw new Error("El número ganador no tiene una compra asociada.");
  }

  await Promise.all([
    RaffleNumber.updateOne(
      { _id: winner._id },
      { $set: { status: RaffleNumberStatus.WINNER } },
    ),
    RaffleTicket.updateMany(
      { raffle: raffleId, isWinner: true },
      { $set: { isWinner: false, status: TicketStatus.PAID } },
    ),
    RaffleTicket.updateOne(
      { _id: winner.ticket },
      { $set: { isWinner: true, status: TicketStatus.WINNER } },
    ),
    Raffle.updateOne(
      { _id: raffleId },
      {
        $set: {
          status: RaffleStatus.DRAWN,
          winnerTicket: winner.number,
          winner: winner.user,
        },
      },
    ),
  ]);

  return Raffle.findById(raffleId)
    .populate("winner", "name avatarUrl phone")
    .populate("createdBy", "name")
    .lean({ virtuals: true });
}
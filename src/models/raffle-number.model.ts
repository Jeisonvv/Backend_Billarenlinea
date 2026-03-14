import mongoose, { Document, Model, Schema } from "mongoose";
import { RaffleNumberStatus } from "./enums.ts";

export function isPowerOfTen(value: number) {
  if (!Number.isInteger(value) || value < 10) return false;

  let current = value;
  while (current % 10 === 0) {
    current /= 10;
  }

  return current === 1;
}

export function getRaffleNumberWidth(totalTickets: number) {
  return String(totalTickets - 1).length;
}

export function formatRaffleNumber(numericValue: number, totalTickets: number) {
  if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue >= totalTickets) {
    throw new Error("El número de rifa está fuera del rango permitido.");
  }

  return String(numericValue).padStart(getRaffleNumberWidth(totalTickets), "0");
}

export function normalizeRaffleNumberInput(value: string | number, totalTickets: number) {
  const rawValue = String(value).trim();

  if (!/^\d+$/.test(rawValue)) {
    throw new Error("Los números de rifa solo pueden contener dígitos.");
  }

  return formatRaffleNumber(Number(rawValue), totalTickets);
}

export interface IRaffleNumber {
  raffle: mongoose.Types.ObjectId;
  number: string;
  numericValue: number;
  status: RaffleNumberStatus;
  user?: mongoose.Types.ObjectId;
  ticket?: mongoose.Types.ObjectId;
  reservedAt?: Date;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRaffleNumberDocument extends IRaffleNumber, Document {}

export interface IRaffleNumberModel extends Model<IRaffleNumberDocument> {
  generateForRaffle(
    raffleId: mongoose.Types.ObjectId,
    totalTickets: number,
  ): Promise<IRaffleNumberDocument[]>;
  findAvailableByRaffle(
    raffleId: mongoose.Types.ObjectId,
  ): Promise<IRaffleNumberDocument[]>;
}

const raffleNumberSchema = new Schema<IRaffleNumberDocument, IRaffleNumberModel>(
  {
    raffle: {
      type: Schema.Types.ObjectId,
      ref: "Raffle",
      required: true,
    },
    number: {
      type: String,
      required: true,
    },
    numericValue: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(RaffleNumberStatus),
      default: RaffleNumberStatus.AVAILABLE,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    ticket: {
      type: Schema.Types.ObjectId,
      ref: "RaffleTicket",
    },
    reservedAt: Date,
    paidAt: Date,
  },
  { timestamps: true },
);

raffleNumberSchema.index({ raffle: 1, number: 1 }, { unique: true });
raffleNumberSchema.index({ raffle: 1, numericValue: 1 }, { unique: true });
raffleNumberSchema.index({ raffle: 1, status: 1, numericValue: 1 });

raffleNumberSchema.statics.generateForRaffle = async function (
  raffleId: mongoose.Types.ObjectId,
  totalTickets: number,
): Promise<IRaffleNumberDocument[]> {
  const existingCount = await this.countDocuments({ raffle: raffleId });
  if (existingCount > 0) {
    return this.find({ raffle: raffleId }).sort({ numericValue: 1 });
  }

  const docs = Array.from({ length: totalTickets }, (_value, numericValue) => ({
    raffle: raffleId,
    number: formatRaffleNumber(numericValue, totalTickets),
    numericValue,
    status: RaffleNumberStatus.AVAILABLE,
  }));

  await this.insertMany(docs, { ordered: true });

  return this.find({ raffle: raffleId }).sort({ numericValue: 1 });
};

raffleNumberSchema.statics.findAvailableByRaffle = function (
  raffleId: mongoose.Types.ObjectId,
): Promise<IRaffleNumberDocument[]> {
  return this.find({
    raffle: raffleId,
    status: RaffleNumberStatus.AVAILABLE,
  }).sort({ numericValue: 1 });
};

const RaffleNumber = mongoose.model<IRaffleNumberDocument, IRaffleNumberModel>("RaffleNumber", raffleNumberSchema);

export default RaffleNumber;
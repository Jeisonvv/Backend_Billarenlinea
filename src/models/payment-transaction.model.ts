import mongoose, { Document, Model, Schema } from "mongoose";
import { PaymentPayableType, PaymentProvider, PaymentTransactionStatus } from "./enums.js";

export interface IPaymentTransaction {
  user: mongoose.Types.ObjectId;
  provider: PaymentProvider;
  payableType: PaymentPayableType;
  payableId: mongoose.Types.ObjectId;
  idempotencyKey: string;
  reference: string;
  amountInCents: number;
  currency: string;
  status: PaymentTransactionStatus;
  redirectUrl?: string;
  expiresAt?: Date;
  externalTransactionId?: string;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  providerMethod?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPaymentTransactionDocument extends IPaymentTransaction, Document {}

export interface IPaymentTransactionModel extends Model<IPaymentTransactionDocument> {}

const paymentTransactionSchema = new Schema<IPaymentTransactionDocument, IPaymentTransactionModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    provider: {
      type: String,
      enum: Object.values(PaymentProvider),
      required: true,
    },
    payableType: {
      type: String,
      enum: Object.values(PaymentPayableType),
      required: true,
    },
    payableId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
    },
    reference: {
      type: String,
      required: true,
      trim: true,
    },
    amountInCents: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      default: "COP",
    },
    status: {
      type: String,
      enum: Object.values(PaymentTransactionStatus),
      default: PaymentTransactionStatus.PENDING,
    },
    redirectUrl: String,
    expiresAt: Date,
    externalTransactionId: String,
    customerEmail: String,
    customerName: String,
    customerPhone: String,
    providerMethod: String,
    metadata: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  { timestamps: true },
);

paymentTransactionSchema.index({ provider: 1, idempotencyKey: 1 }, { unique: true });
paymentTransactionSchema.index({ provider: 1, reference: 1 }, { unique: true });
paymentTransactionSchema.index({ payableType: 1, payableId: 1, provider: 1 });
paymentTransactionSchema.index({ status: 1, expiresAt: 1 });
paymentTransactionSchema.index({ user: 1, createdAt: -1 });

const PaymentTransaction = mongoose.model<IPaymentTransactionDocument, IPaymentTransactionModel>(
  "PaymentTransaction",
  paymentTransactionSchema,
);

export default PaymentTransaction;
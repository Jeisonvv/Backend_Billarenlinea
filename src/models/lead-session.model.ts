import mongoose, {
  Document,
  Model,
  Schema,
  Types,
} from "mongoose";
import { Channel, InterestType, LeadSessionStatus } from "./enums.ts";

export interface ILeadSessionData {
  name?: string;
  phone?: string;
  city?: string;
  businessName?: string;
  interestType?: InterestType;
  extraData?: Map<string, unknown>;
}

export interface ILeadSession {
  channel: Channel;
  providerId: string;
  currentState: string;
  stateData: Map<string, unknown>;
  leadData: ILeadSessionData;
  status: LeadSessionStatus;
  qualified: boolean;
  persistedUserId?: Types.ObjectId;
  firstSeenAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILeadSessionDocument extends ILeadSession, Document {}

export interface ILeadSessionModel extends Model<ILeadSessionDocument> {
  findActiveByIdentity(
    channel: Channel,
    providerId: string,
  ): Promise<ILeadSessionDocument | null>;
}

const leadDataSchema = new Schema<ILeadSessionData>(
  {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    city: { type: String, trim: true },
    businessName: { type: String, trim: true },
    interestType: {
      type: String,
      enum: Object.values(InterestType),
    },
    extraData: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false },
);

const leadSessionSchema = new Schema<ILeadSessionDocument, ILeadSessionModel>(
  {
    channel: {
      type: String,
      enum: Object.values(Channel),
      required: true,
    },
    providerId: {
      type: String,
      required: true,
      trim: true,
    },
    currentState: {
      type: String,
      default: "IDLE",
      trim: true,
    },
    stateData: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    leadData: {
      type: leadDataSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      enum: Object.values(LeadSessionStatus),
      default: LeadSessionStatus.ACTIVE,
    },
    qualified: {
      type: Boolean,
      default: false,
    },
    persistedUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    firstSeenAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

leadSessionSchema.index({ channel: 1, providerId: 1 }, { unique: true });
leadSessionSchema.index({ status: 1, lastSeenAt: -1 });
leadSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

leadSessionSchema.statics.findActiveByIdentity = function (
  channel: Channel,
  providerId: string,
): Promise<ILeadSessionDocument | null> {
  return this.findOne({ channel, providerId });
};

const LeadSession = mongoose.model<ILeadSessionDocument, ILeadSessionModel>(
  "LeadSession",
  leadSessionSchema,
);

export default LeadSession;
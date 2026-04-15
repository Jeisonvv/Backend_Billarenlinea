import mongoose, { Document, Schema } from "mongoose";
import {
  EventRegistrationMode,
  EventStatus,
  EventTicketingMode,
  EventTier,
  EventType,
} from "./enums.js";

export interface IEventPrize {
  position: number;
  description: string;
  amount?: number;
}

export interface IEvent {
  name: string;
  description?: string;
  type: EventType;
  tier: EventTier;
  status: EventStatus;
  organizer?: string;
  location?: string;
  city?: string;
  department?: string;
  country: string;
  startDate: Date;
  endDate?: Date;
  entryFee?: number;
  registrationMode: EventRegistrationMode;
  imageUrl?: string;
  streamUrl?: string;
  registrationUrl?: string;
  hasGrandstand: boolean;
  grandstandDetails?: string;
  ticketingMode: EventTicketingMode;
  ticketPrice?: number;
  ticketUrl?: string;
  resultsUrl?: string;
  featured: boolean;
  prizes: IEventPrize[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEventDocument extends IEvent, Document {
  readonly isUpcoming: boolean;
  readonly isActive: boolean;
}

const eventPrizeSchema = new Schema<IEventPrize>(
  {
    position: {
      type: Number,
      required: true,
      min: 1,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      min: 0,
    },
  },
  { _id: false },
);

const eventSchema = new Schema<IEventDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(EventType),
      required: true,
    },
    tier: {
      type: String,
      enum: Object.values(EventTier),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(EventStatus),
      default: EventStatus.SCHEDULED,
    },
    organizer: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
      default: "Colombia",
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    entryFee: {
      type: Number,
      min: 0,
      default: 0,
    },
    registrationMode: {
      type: String,
      enum: Object.values(EventRegistrationMode),
      default: EventRegistrationMode.NONE,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    streamUrl: {
      type: String,
      trim: true,
    },
    registrationUrl: {
      type: String,
      trim: true,
    },
    hasGrandstand: {
      type: Boolean,
      default: false,
    },
    grandstandDetails: {
      type: String,
      trim: true,
    },
    ticketingMode: {
      type: String,
      enum: Object.values(EventTicketingMode),
      default: EventTicketingMode.NO_TICKETS,
    },
    ticketPrice: {
      type: Number,
      min: 0,
    },
    ticketUrl: {
      type: String,
      trim: true,
    },
    resultsUrl: {
      type: String,
      trim: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    prizes: {
      type: [eventPrizeSchema],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

eventSchema.index({ status: 1, startDate: 1 });
eventSchema.index({ tier: 1, type: 1, startDate: 1 });
eventSchema.index({ featured: 1, startDate: 1 });

eventSchema.virtual("isUpcoming").get(function (this: IEventDocument) {
  return this.startDate > new Date() && this.status === EventStatus.SCHEDULED;
});

eventSchema.virtual("isActive").get(function (this: IEventDocument) {
  return this.status === EventStatus.LIVE;
});

const Event = mongoose.model<IEventDocument>("Event", eventSchema);

export default Event;
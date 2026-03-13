import mongoose, { Document, Schema } from "mongoose";

export interface TransmissionRequestDocument extends Document {
  contactName: string;
  contactPhone: number;
  billiardName: string;
  city: string;
  tournamentType: "RELAMPAGO" | "ABIERTO";
  eventDate: string;
  serviceType: "TRANSMISION" | "ORGANIZACION" | "AMBOS";
  status: "PENDIENTE" | "COTIZADO" | "CONFIRMADO" | "RECHAZADO";
  comments?: string;
  whatsappId?: string;
  createdAt: Date;
}

const TransmissionRequestSchema = new Schema<TransmissionRequestDocument>({
  contactName: { type: String, required: true },
  contactPhone: { type: Number, required: true },
  billiardName: { type: String, required: true },
  city: { type: String, required: true },
  tournamentType: { type: String, enum: ["RELAMPAGO", "ABIERTO"], required: true },
  eventDate: { type: String, required: true },
  serviceType: { type: String, enum: ["TRANSMISION", "ORGANIZACION", "AMBOS"], required: true },
  status: { type: String, enum: ["PENDIENTE", "COTIZADO", "CONFIRMADO", "RECHAZADO"], default: "PENDIENTE" },
  comments: { type: String },
  whatsappId: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const TransmissionRequest = mongoose.model<TransmissionRequestDocument>("TransmissionRequest", TransmissionRequestSchema);

export default TransmissionRequest;

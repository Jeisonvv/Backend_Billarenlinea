import mongoose, { Document, Schema } from "mongoose";

export interface RevokedTokenDocument extends Document {
  token: string;
  expiresAt: Date;
}

const RevokedTokenSchema = new Schema<RevokedTokenDocument>({
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

// El documento se eliminará automáticamente después de expiresAt
RevokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RevokedToken = mongoose.model<RevokedTokenDocument>("RevokedToken", RevokedTokenSchema);

export default RevokedToken;

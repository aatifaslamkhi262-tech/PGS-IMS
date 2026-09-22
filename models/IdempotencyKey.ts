import mongoose, { Schema, Document, Model } from "mongoose";

export interface IIdempotencyKey extends Document {
  key: string;
  requestHash: string;
  endpoint: string;
  statusCode?: number;
  responseBody?: any;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  startedAt: Date;
  completedAt?: Date;
  expiresAt: Date;
}

const IdempotencyKeySchema: Schema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    requestHash: {
      type: String,
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    statusCode: {
      type: Number,
    },
    responseBody: {
      type: Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: ["PROCESSING", "COMPLETED", "FAILED"],
      default: "PROCESSING",
      required: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    completedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  }
);

export const IdempotencyKey: Model<IIdempotencyKey> =
  mongoose.models.IdempotencyKey || mongoose.model<IIdempotencyKey>("IdempotencyKey", IdempotencyKeySchema);

import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICostAdjustment extends Document {
  product: mongoose.Types.ObjectId;
  previousCost: number;
  newCost: number;
  costType: "MANUAL_OVERRIDE" | "HISTORICAL_CORRECTION";
  reason: string;
  changedBy: mongoose.Types.ObjectId;
  userRole: string;
  reference?: string;
  createdAt: Date;
}

const CostAdjustmentSchema: Schema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
      index: true,
    },
    previousCost: {
      type: Number,
      required: [true, "Previous cost is required"],
      min: [0, "Previous cost cannot be negative"],
    },
    newCost: {
      type: Number,
      required: [true, "New cost is required"],
      min: [0, "New cost cannot be negative"],
    },
    costType: {
      type: String,
      enum: ["MANUAL_OVERRIDE", "HISTORICAL_CORRECTION"],
      required: [true, "Cost type is required"],
    },
    reason: {
      type: String,
      required: [true, "Reason is required"],
      trim: true,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    userRole: {
      type: String,
      required: [true, "User role is required"],
    },
    reference: {
      type: String,
      trim: true,
      default: "Manual Product Directory Edit",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const CostAdjustment: Model<ICostAdjustment> =
  mongoose.models.CostAdjustment ||
  mongoose.model<ICostAdjustment>("CostAdjustment", CostAdjustmentSchema);

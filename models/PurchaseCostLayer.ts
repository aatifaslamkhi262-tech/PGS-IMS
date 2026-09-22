import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IPurchaseCostLayer extends Document {
  product: Types.ObjectId;
  location: Types.ObjectId;
  condition: string;
  unitCost: number;
  receivedQty: number;
  remainingQty: number;
  purchaseReference?: string;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseCostLayerSchema: Schema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    condition: {
      type: String,
      required: true,
      default: "New",
      trim: true,
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0,
    },
    receivedQty: {
      type: Number,
      required: true,
      min: 1,
    },
    remainingQty: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    purchaseReference: {
      type: String,
      trim: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true, // Used to sort FIFO by oldest arrival
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast FIFO layer lookup by product, location, condition, and remainingQty > 0
PurchaseCostLayerSchema.index({ product: 1, location: 1, condition: 1, remainingQty: 1, receivedAt: 1 });

export const PurchaseCostLayer: Model<IPurchaseCostLayer> =
  mongoose.models.PurchaseCostLayer || mongoose.model<IPurchaseCostLayer>("PurchaseCostLayer", PurchaseCostLayerSchema);

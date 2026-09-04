import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type MovementType = "PURCHASE_RECEIVING" | "OPENING_STOCK" | "TRANSFER" | "RETURN" | "DAMAGE" | "CLAIM" | "ADJUSTMENT";

export interface IInventoryMovement {
  product: Types.ObjectId;
  quantity: number;
  serialNumbers?: string[];
  sourceLocation?: Types.ObjectId; // Location ID
  sourceName: string; // e.g. "Supplier" or Location Name
  destinationLocation?: Types.ObjectId; // Location ID
  destinationName: string; // e.g. Location Name
  type: MovementType;
  referenceTransaction?: string; // e.g. invoiceNumber or receivingNumber
  beforeQuantity: number;
  afterQuantity: number;
  performedBy: string; // username of operator
  approvedBy?: string; // username of accountant/admin who approved
  date: Date;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type InventoryMovementDocument = Document & IInventoryMovement;

const InventoryMovementSchema: Schema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product reference is required"],
      index: true,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
    },
    serialNumbers: {
      type: [String],
      default: [],
    },
    sourceLocation: {
      type: Schema.Types.ObjectId,
      ref: "Location",
    },
    sourceName: {
      type: String,
      required: [true, "Source Name is required"],
    },
    destinationLocation: {
      type: Schema.Types.ObjectId,
      ref: "Location",
    },
    destinationName: {
      type: String,
      required: [true, "Destination Name is required"],
    },
    type: {
      type: String,
      enum: ["PURCHASE_RECEIVING", "OPENING_STOCK", "TRANSFER", "RETURN", "DAMAGE", "CLAIM", "ADJUSTMENT"],
      required: [true, "Movement Type is required"],
      index: true,
    },
    referenceTransaction: {
      type: String,
      trim: true,
      index: true,
    },
    beforeQuantity: {
      type: Number,
      required: [true, "Before quantity audit info is required"],
      min: 0,
    },
    afterQuantity: {
      type: Number,
      required: [true, "After quantity audit info is required"],
      min: 0,
    },
    performedBy: {
      type: String,
      required: [true, "Performed by is required"],
    },
    approvedBy: {
      type: String,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const InventoryMovement: Model<IInventoryMovement> =
  mongoose.models.InventoryMovement ||
  mongoose.model<IInventoryMovement>("InventoryMovement", InventoryMovementSchema);

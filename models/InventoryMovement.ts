import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type MovementType =
  | "PURCHASE_RECEIVING"
  | "OPENING_STOCK"
  | "TRANSFER"
  | "RETURN"
  | "DAMAGE"
  | "CLAIM"
  | "ADJUSTMENT"
  | "STOCK_IN"
  | "SALE_OUT"
  | "RETURN_IN";

export interface IInventoryMovement {
  product: Types.ObjectId;
  productName?: string;
  sku?: string;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  serialNumbers?: string[];
  sourceLocation?: Types.ObjectId; // Location ID
  sourceName: string; // e.g. "Supplier" or Location Name
  destinationLocation?: Types.ObjectId; // Location ID
  destinationName: string; // e.g. Location Name
  type: MovementType;
  referenceType?: string;
  referenceTransaction?: string; // e.g. invoiceNumber or receivingNumber
  referenceId?: string;
  reason?: string;
  beforeQuantity: number;
  afterQuantity: number;
  performedBy: string; // username of operator
  approvedBy?: string; // username of accountant/admin who approved
  carrierUser?: Types.ObjectId;
  carrierName?: string;
  carrierUsername?: string;
  dispatchedBy?: string;
  condition?: string; // "New" | "Used" | "Refurbished" | "Defective"
  linkedTransferNumber?: string;
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
    productName: { type: String },
    sku: { type: String },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
    },
    unitCost: { type: Number, min: 0 },
    totalCost: { type: Number, min: 0 },
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
      enum: [
        "PURCHASE_RECEIVING",
        "OPENING_STOCK",
        "TRANSFER",
        "RETURN",
        "DAMAGE",
        "CLAIM",
        "ADJUSTMENT",
        "STOCK_IN",
        "SALE_OUT",
        "RETURN_IN",
      ],
      required: [true, "Movement Type is required"],
      index: true,
    },
    referenceType: { type: String },
    referenceTransaction: {
      type: String,
      trim: true,
      index: true,
    },
    referenceId: { type: String },
    reason: { type: String },
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
    carrierUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    carrierName: {
      type: String,
      trim: true,
    },
    carrierUsername: {
      type: String,
      trim: true,
    },
    dispatchedBy: {
      type: String,
    },
    condition: {
      type: String,
      trim: true,
    },
    linkedTransferNumber: {
      type: String,
      trim: true,
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

import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type SerialStatus = "Available" | "Sold" | "Returned" | "Damaged" | "Claim" | "Transferred";

export interface ISerialNumber {
  _id?: Types.ObjectId;
  product: Types.ObjectId;
  serialNumber: string;
  status: SerialStatus;
  location?: string;
  transactionReference?: string;
  invoiceId?: Types.ObjectId;
  saleDate?: Date;
  returnDate?: Date;
  damageDate?: Date;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SerialNumberDocument = Document & ISerialNumber;

const SerialNumberSchema: Schema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
      index: true,
    },
    serialNumber: {
      type: String,
      required: [true, "Serial Number is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["Available", "Sold", "Returned", "Damaged", "Claim", "Transferred"],
      default: "Available",
      index: true,
    },
    location: {
      type: String,
      trim: true,
    },
    transactionReference: {
      type: String,
      trim: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
    },
    saleDate: {
      type: Date,
    },
    returnDate: {
      type: Date,
    },
    damageDate: {
      type: Date,
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

// Ensure unique serial number per product
SerialNumberSchema.index({ product: 1, serialNumber: 1 }, { unique: true });

// Ensure unique serial number globally across all products
SerialNumberSchema.index({ serialNumber: 1 }, { unique: true });

// Index for querying available serials by product
SerialNumberSchema.index({ product: 1, status: 1 });

// Index for transaction reference lookups
SerialNumberSchema.index({ transactionReference: 1 });

export const SerialNumber: Model<ISerialNumber> =
  mongoose.models.SerialNumber || mongoose.model<ISerialNumber>("SerialNumber", SerialNumberSchema);

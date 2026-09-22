import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ICashSession {
  _id?: Types.ObjectId;
  sessionNumber: string; // e.g. SES-20260915-001
  location: Types.ObjectId;
  locationName: string;
  cashier: string; // username
  openingCash: number;
  expectedCash: number;
  actualCash?: number;
  variance?: number; // actualCash - expectedCash
  totalCashSales: number;
  totalCardSales: number;
  totalOnlineSales: number;
  totalRefunds: number;
  totalExpenses: number;
  status: "OPEN" | "CLOSED";
  notes?: string;
  varianceReason?: string;
  openedAt: Date;
  closedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CashSessionDocument = Document & ICashSession;

const CashSessionSchema: Schema = new Schema(
  {
    sessionNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    locationName: { type: String, required: true },
    cashier: { type: String, required: true, index: true },
    openingCash: { type: Number, required: true, min: 0 },
    expectedCash: { type: Number, required: true, min: 0 },
    actualCash: { type: Number, min: 0 },
    variance: { type: Number },
    totalCashSales: { type: Number, default: 0, min: 0 },
    totalCardSales: { type: Number, default: 0, min: 0 },
    totalOnlineSales: { type: Number, default: 0, min: 0 },
    totalRefunds: { type: Number, default: 0, min: 0 },
    totalExpenses: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
      index: true,
    },
    notes: { type: String, trim: true },
    varianceReason: { type: String, trim: true },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

export const CashSession: Model<ICashSession> =
  mongoose.models.CashSession || mongoose.model<ICashSession>("CashSession", CashSessionSchema);

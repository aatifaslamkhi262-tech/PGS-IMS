import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type SettlementType =
  | "CASH_PAID_BY_CUSTOMER"
  | "CASH_REFUNDED_TO_CUSTOMER"
  | "STORE_CREDIT_ISSUED"
  | "EVEN_EXCHANGE";

export interface ITradeInItem {
  product: Types.ObjectId;
  productName: string;
  condition: string;
  quantity: number;
  serialNumber?: string;
  agreedTradeInValue: number;
}

export interface IReplacementItem {
  product: Types.ObjectId;
  productName: string;
  sku: string;
  condition: string;
  quantity: number;
  unitPrice: number;
  serialNumbers?: string[];
  lineTotal: number;
}

export interface ITradeIn extends Document {
  tradeInNumber: string; // e.g. TRD-20260916-001
  customer?: Types.ObjectId;
  customerName: string;
  customerPhone?: string;
  location: Types.ObjectId;
  locationName: string;
  tradeInItem: ITradeInItem;
  replacementItems: IReplacementItem[];
  tradeInTotalValue: number;
  replacementTotalValue: number;
  netDifference: number; // replacementTotal - tradeInTotal
  settlementType: SettlementType;
  paymentMethod?: string; // CASH, CARD, BANK_TRANSFER, STORE_CREDIT
  status: "COMPLETED" | "CANCELLED";
  processedBy: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TradeInSchema: Schema = new Schema(
  {
    tradeInNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerPhone: {
      type: String,
      trim: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    locationName: {
      type: String,
      required: true,
    },
    tradeInItem: {
      product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
      productName: { type: String, required: true },
      condition: { type: String, required: true, default: "Used" },
      quantity: { type: Number, required: true, default: 1 },
      serialNumber: { type: String, trim: true },
      agreedTradeInValue: { type: Number, required: true, min: 0 },
    },
    replacementItems: [
      {
        product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
        productName: { type: String, required: true },
        sku: { type: String, required: true },
        condition: { type: String, required: true, default: "New" },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        serialNumbers: [{ type: String }],
        lineTotal: { type: Number, required: true, min: 0 },
      },
    ],
    tradeInTotalValue: {
      type: Number,
      required: true,
      min: 0,
    },
    replacementTotalValue: {
      type: Number,
      required: true,
      min: 0,
    },
    netDifference: {
      type: Number,
      required: true,
    },
    settlementType: {
      type: String,
      enum: ["CASH_PAID_BY_CUSTOMER", "CASH_REFUNDED_TO_CUSTOMER", "STORE_CREDIT_ISSUED", "EVEN_EXCHANGE"],
      required: true,
    },
    paymentMethod: {
      type: String,
    },
    status: {
      type: String,
      enum: ["COMPLETED", "CANCELLED"],
      default: "COMPLETED",
      required: true,
    },
    processedBy: {
      type: String,
      required: true,
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

export const TradeIn: Model<ITradeIn> =
  mongoose.models.TradeIn || mongoose.model<ITradeIn>("TradeIn", TradeInSchema);

import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type PaymentMethod =
  | "CASH"
  | "CARD"
  | "BANK_TRANSFER"
  | "ONLINE_GATEWAY"
  | "COD"
  | "CUSTOMER_ADVANCE";

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "FAILED" | "REFUNDED";

export interface IPaymentAllocation {
  invoice: Types.ObjectId;
  invoiceNumber?: string;
  amount: number;
}

export interface IPayment {
  _id?: Types.ObjectId;
  paymentNumber: string; // e.g. PAY-20260915-001
  sale?: Types.ObjectId;
  invoice?: Types.ObjectId;
  customer?: Types.ObjectId;
  location: Types.ObjectId;
  paymentMethod: PaymentMethod;
  amount: number;
  allocations?: IPaymentAllocation[];
  referenceNumber?: string; // Card Approval Code, Bank Tx ID, etc.
  notes?: string;
  receivedBy: string; // username
  verifiedBy?: string;
  status: PaymentStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PaymentDocument = Document & IPayment;

const PaymentSchema: Schema = new Schema(
  {
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    sale: {
      type: Schema.Types.ObjectId,
      ref: "Sale",
      index: true,
    },
    invoice: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: [
        "CASH",
        "CARD",
        "BANK_TRANSFER",
        "ONLINE_GATEWAY",
        "COD",
        "CUSTOMER_ADVANCE",
      ],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    allocations: [
      {
        invoice: { type: Schema.Types.ObjectId, ref: "Invoice" },
        invoiceNumber: { type: String },
        amount: { type: Number, required: true },
      },
    ],
    referenceNumber: { type: String, trim: true },
    notes: { type: String, trim: true },
    receivedBy: { type: String, required: true },
    verifiedBy: { type: String },
    status: {
      type: String,
      enum: ["UNPAID", "PARTIALLY_PAID", "PAID", "FAILED", "REFUNDED"],
      default: "PAID",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Payment: Model<IPayment> =
  mongoose.models.Payment || mongoose.model<IPayment>("Payment", PaymentSchema);

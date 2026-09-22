import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type CustomerLedgerType =
  | "INVOICE"
  | "PAYMENT"
  | "RETURN_CREDIT"
  | "ADVANCE_DEPOSIT"
  | "STORE_CREDIT_ISSUED"
  | "STORE_CREDIT_REDEEMED"
  | "DEBT_ADJUSTMENT";

export type CustomerLedgerReferenceType =
  | "Sale"
  | "Payment"
  | "Return"
  | "Exchange"
  | "TradeIn"
  | "AdvanceBooking"
  | "Refund"
  | "StoreCredit"
  | "DebtAdjustment";

export interface ICustomerLedger extends Document {
  entryNumber: string;
  customer: Types.ObjectId;
  type: CustomerLedgerType;
  debit: number;
  credit: number;
  amount: number;
  runningOutstanding: number;
  runningAdvance: number;
  runningStoreCredit: number;
  referenceType: CustomerLedgerReferenceType;
  referenceId: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
}

const CustomerLedgerSchema: Schema = new Schema(
  {
    entryNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "INVOICE",
        "PAYMENT",
        "RETURN_CREDIT",
        "ADVANCE_DEPOSIT",
        "STORE_CREDIT_ISSUED",
        "STORE_CREDIT_REDEEMED",
        "DEBT_ADJUSTMENT",
      ],
      required: true,
    },
    debit: {
      type: Number,
      default: 0,
      min: 0,
    },
    credit: {
      type: Number,
      default: 0,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
    },
    runningOutstanding: {
      type: Number,
      default: 0,
    },
    runningAdvance: {
      type: Number,
      default: 0,
    },
    runningStoreCredit: {
      type: Number,
      default: 0,
    },
    referenceType: {
      type: String,
      enum: [
        "Sale",
        "Payment",
        "Return",
        "Exchange",
        "TradeIn",
        "AdvanceBooking",
        "Refund",
        "StoreCredit",
        "DebtAdjustment",
      ],
      required: true,
    },
    referenceId: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const CustomerLedger: Model<ICustomerLedger> =
  mongoose.models.CustomerLedger || mongoose.model<ICustomerLedger>("CustomerLedger", CustomerLedgerSchema);

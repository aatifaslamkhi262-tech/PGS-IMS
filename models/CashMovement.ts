import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type CashMovementType =
  | "OPENING_CASH"
  | "CASH_SALE"
  | "DEBT_COLLECTION"
  | "CASH_REFUND"
  | "PETTY_CASH"
  | "CASH_WITHDRAWAL"
  | "CASH_ADJUSTMENT_IN"
  | "CASH_ADJUSTMENT_OUT"
  | "ATIF_WITHDRAW"
  | "ATIF_DEPOSIT"
  | "CUSTOMER_BUYBACK"
  | "CARD_SETTLEMENT_IN";

export interface ICashMovement extends Document {
  movementNumber: string;
  cashSession: Types.ObjectId;
  location: Types.ObjectId;
  shopTag?: string;
  paymentMethod?: string;
  cashier: string;
  type: CashMovementType;
  amount: number;
  direction: "IN" | "OUT";
  referenceType?: "Sale" | "Payment" | "Expense" | "Return" | "TradeIn" | "Withdrawal" | "Adjustment" | "PurchaseInvoice";
  referenceId?: string;
  attachmentUrl?: string;
  notes?: string;
  createdAt: Date;
}

const CashMovementSchema: Schema = new Schema(
  {
    movementNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cashSession: {
      type: Schema.Types.ObjectId,
      ref: "CashSession",
      required: true,
      index: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    shopTag: {
      type: String,
      trim: true,
    },
    paymentMethod: {
      type: String,
      trim: true,
      default: "CASH",
    },
    cashier: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "OPENING_CASH",
        "CASH_SALE",
        "DEBT_COLLECTION",
        "CASH_REFUND",
        "PETTY_CASH",
        "CASH_WITHDRAWAL",
        "CASH_ADJUSTMENT_IN",
        "CASH_ADJUSTMENT_OUT",
        "ATIF_WITHDRAW",
        "ATIF_DEPOSIT",
        "CUSTOMER_BUYBACK",
        "CARD_SETTLEMENT_IN",
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    direction: {
      type: String,
      enum: ["IN", "OUT"],
      required: true,
    },
    referenceType: {
      type: String,
      enum: ["Sale", "Payment", "Expense", "Return", "TradeIn", "Withdrawal", "Adjustment", "PurchaseInvoice"],
    },
    referenceId: {
      type: String,
    },
    attachmentUrl: {
      type: String,
      trim: true,
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

export const CashMovement: Model<ICashMovement> =
  mongoose.models.CashMovement || mongoose.model<ICashMovement>("CashMovement", CashMovementSchema);

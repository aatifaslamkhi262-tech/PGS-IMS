import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type CashMovementType =
  | "OPENING_CASH"
  | "CASH_SALE"
  | "DEBT_COLLECTION"
  | "CASH_REFUND"
  | "PETTY_CASH"
  | "CASH_WITHDRAWAL"
  | "CASH_ADJUSTMENT_IN"
  | "CASH_ADJUSTMENT_OUT";

export interface ICashMovement extends Document {
  movementNumber: string;
  cashSession: Types.ObjectId;
  location: Types.ObjectId;
  cashier: string;
  type: CashMovementType;
  amount: number;
  direction: "IN" | "OUT";
  referenceType?: "Sale" | "Payment" | "Expense" | "Return" | "TradeIn" | "Withdrawal" | "Adjustment";
  referenceId?: string;
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
      enum: ["Sale", "Payment", "Expense", "Return", "TradeIn", "Withdrawal", "Adjustment"],
    },
    referenceId: {
      type: String,
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

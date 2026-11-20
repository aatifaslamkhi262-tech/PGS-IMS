import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type ExpenseCategory =
  | "Petrol"
  | "Fuel"
  | "Tea"
  | "Food"
  | "IT Expense"
  | "Cleaning"
  | "Delivery"
  | "Rider Expense"
  | "Salary"
  | "Rent"
  | "Utility"
  | "Packaging"
  | "Atif Withdraw"
  | "Atif Deposit"
  | "Purchasing"
  | "Other";

export interface IExpense {
  _id?: Types.ObjectId;
  expenseNumber: string; // e.g. PCV-20260915-001 or EXP-20260915-001
  location: Types.ObjectId;
  locationName: string;
  shopTag?: string; // e.g. "P.G.S", "G-14", "G-39", "M.G.S"
  entryType?: "EXPENSE" | "ATIF_WITHDRAW" | "ATIF_DEPOSIT" | "CASH_PURCHASING";
  category: ExpenseCategory;
  amount: number;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "ONLINE" | "CARD" | "SPLIT";
  cashAmount?: number;
  onlineAmount?: number;
  recipient?: string;
  reason?: string;
  attachmentUrl?: string;
  notes?: string;
  createdBy: string;
  approvedBy?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt?: Date;
  updatedAt?: Date;
}

export type ExpenseDocument = Document & IExpense;

const ExpenseSchema: Schema = new Schema(
  {
    expenseNumber: {
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
    },
    locationName: { type: String, required: true },
    shopTag: { type: String, trim: true, default: "P.G.S" },
    entryType: {
      type: String,
      enum: ["EXPENSE", "ATIF_WITHDRAW", "ATIF_DEPOSIT", "CASH_PURCHASING"],
      default: "EXPENSE",
      index: true,
    },
    category: {
      type: String,
      enum: [
        "Petrol",
        "Fuel",
        "Tea",
        "Food",
        "IT Expense",
        "Cleaning",
        "Delivery",
        "Rider Expense",
        "Salary",
        "Rent",
        "Utility",
        "Packaging",
        "Atif Withdraw",
        "Atif Deposit",
        "Purchasing",
        "Other",
      ],
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: {
      type: String,
      enum: ["CASH", "BANK_TRANSFER", "ONLINE", "CARD", "SPLIT"],
      default: "CASH",
    },
    cashAmount: { type: Number, default: 0, min: 0 },
    onlineAmount: { type: Number, default: 0, min: 0 },
    recipient: { type: String, trim: true },
    reason: { type: String, trim: true },
    attachmentUrl: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: String, required: true },
    approvedBy: { type: String },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "APPROVED",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

ExpenseSchema.index({ createdAt: -1, status: 1 });
ExpenseSchema.index({ location: 1, createdAt: -1 });

export const Expense: Model<IExpense> =
  mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);
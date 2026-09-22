import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type ExpenseCategory =
  | "Petrol"
  | "Delivery"
  | "Rider Expense"
  | "Salary"
  | "Rent"
  | "Utility"
  | "Packaging"
  | "Other";

export interface IExpense {
  _id?: Types.ObjectId;
  expenseNumber: string; // e.g. EXP-20260915-001
  location: Types.ObjectId;
  locationName: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "CARD";
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
    category: {
      type: String,
      enum: [
        "Petrol",
        "Delivery",
        "Rider Expense",
        "Salary",
        "Rent",
        "Utility",
        "Packaging",
        "Other",
      ],
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: {
      type: String,
      enum: ["CASH", "BANK_TRANSFER", "CARD"],
      default: "CASH",
    },
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

export const Expense: Model<IExpense> =
  mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);

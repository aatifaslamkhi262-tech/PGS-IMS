import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type AdvanceStatus = "ACTIVE" | "PAID_OFF";

export interface IAdvanceDeductionEntry {
  month: string; // YYYY-MM
  amount: number;
  payrollId?: Types.ObjectId | null;
  deductedAt: Date;
  notes?: string;
}

export interface ISalaryAdvance {
  _id?: Types.ObjectId;
  employee: Types.ObjectId;
  amount: number;
  monthlyDeduction: number;
  remainingBalance: number;
  issueDate: string; // YYYY-MM-DD
  reason: string;
  status: AdvanceStatus;
  deductions: IAdvanceDeductionEntry[];

  issuedBy?: Types.ObjectId | null;
  issuedByName?: string;
  notes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export type SalaryAdvanceDocument = Document & ISalaryAdvance;

const AdvanceDeductionSchema = new Schema(
  {
    month: { type: String, required: true },
    amount: { type: Number, required: true },
    payrollId: { type: Schema.Types.ObjectId, ref: "MonthlyPayroll", default: null },
    deductedAt: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const SalaryAdvanceSchema: Schema = new Schema(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    monthlyDeduction: {
      type: Number,
      required: true,
      min: 1,
    },
    remainingBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    issueDate: {
      type: String,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "PAID_OFF"],
      default: "ACTIVE",
      index: true,
    },
    deductions: {
      type: [AdvanceDeductionSchema],
      default: [],
    },
    issuedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    issuedByName: {
      type: String,
      default: "",
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

SalaryAdvanceSchema.index({ employee: 1, status: 1 });

export const SalaryAdvance: Model<ISalaryAdvance> =
  mongoose.models.SalaryAdvance ||
  mongoose.model<ISalaryAdvance>("SalaryAdvance", SalaryAdvanceSchema);


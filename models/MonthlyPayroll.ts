import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type PayrollStatus = "DRAFT" | "RELEASED" | "LOCKED";

export interface IMonthlyPayroll {
  _id?: Types.ObjectId;
  month: string; // YYYY-MM or custom period key
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  periodLabel?: string; // e.g. "11-Oct-2026 to 10-Nov-2026"
  employee: Types.ObjectId;
  employeeCode: string;
  employeeName: string;
  designation: string;
  location?: Types.ObjectId | null;

  baseSalary: number;
  dailyRate: number; // baseSalary / 30
  hourlyRate: number; // dailyRate / requiredDailyHours

  // Attendance & Target Metrics
  calendarDays: number;
  scheduledWorkingDays: number;
  targetHours: number;
  clockedWorkedHours: number;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  weeklyOffsCount: number;
  holidaysCount: number;
  paidOffsCount: number;
  workedOnDayOffCount: number;

  // Penalties & Compensations
  lateArrivalsCount: number;
  latePenaltyDays: number; // floor(lateArrivalsCount / 3)
  shortHours: number; // targetHours - clockedWorkedHours (if > 0)
  overtimeHours: number;

  // Financial Breakdown
  shortHoursDeduction: number;
  lateDeduction: number;
  unpaidLeaveDeduction: number;
  overtimePay: number;
  advanceDeduction: number;
  bonus: number;
  cardFeeDeduction: number;
  netSalary: number;

  // Lifecycle & Security Lock
  status: PayrollStatus;
  calculatedAt: Date;
  calculatedBy?: Types.ObjectId | null;
  calculatedByName?: string;

  releasedAt?: Date | null;
  releasedBy?: Types.ObjectId | null;
  releasedByName?: string;

  reopenReason?: string;
  reopenedAt?: Date | null;
  reopenedBy?: Types.ObjectId | null;
  reopenedByName?: string;

  notes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export type MonthlyPayrollDocument = Document & IMonthlyPayroll;

const MonthlyPayrollSchema: Schema = new Schema(
  {
    month: {
      type: String,
      required: true,
      index: true,
    },
    startDate: {
      type: String,
      default: "",
      index: true,
    },
    endDate: {
      type: String,
      default: "",
      index: true,
    },
    periodLabel: {
      type: String,
      default: "",
    },
    employee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    employeeCode: {
      type: String,
      required: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    designation: {
      type: String,
      required: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      default: null,
    },
    baseSalary: {
      type: Number,
      required: true,
      min: 0,
    },
    dailyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    hourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    calendarDays: {
      type: Number,
      required: true,
    },
    scheduledWorkingDays: {
      type: Number,
      required: true,
    },
    targetHours: {
      type: Number,
      required: true,
    },
    clockedWorkedHours: {
      type: Number,
      required: true,
    },
    presentDays: {
      type: Number,
      default: 0,
    },
    halfDays: {
      type: Number,
      default: 0,
    },
    absentDays: {
      type: Number,
      default: 0,
    },
    weeklyOffsCount: {
      type: Number,
      default: 0,
    },
    holidaysCount: {
      type: Number,
      default: 0,
    },
    paidOffsCount: {
      type: Number,
      default: 0,
    },
    workedOnDayOffCount: {
      type: Number,
      default: 0,
    },
    lateArrivalsCount: {
      type: Number,
      default: 0,
    },
    latePenaltyDays: {
      type: Number,
      default: 0,
    },
    shortHours: {
      type: Number,
      default: 0,
    },
    overtimeHours: {
      type: Number,
      default: 0,
    },
    shortHoursDeduction: {
      type: Number,
      default: 0,
    },
    lateDeduction: {
      type: Number,
      default: 0,
    },
    unpaidLeaveDeduction: {
      type: Number,
      default: 0,
    },
    overtimePay: {
      type: Number,
      default: 0,
    },
    advanceDeduction: {
      type: Number,
      default: 0,
    },
    bonus: {
      type: Number,
      default: 0,
    },
    cardFeeDeduction: {
      type: Number,
      default: 0,
    },
    netSalary: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "RELEASED", "LOCKED"],
      default: "DRAFT",
      index: true,
    },
    calculatedAt: {
      type: Date,
      default: Date.now,
    },
    calculatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    calculatedByName: {
      type: String,
      default: "",
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    releasedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    releasedByName: {
      type: String,
      default: "",
    },
    reopenReason: {
      type: String,
      default: "",
    },
    reopenedAt: {
      type: Date,
      default: null,
    },
    reopenedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reopenedByName: {
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

MonthlyPayrollSchema.index({ month: 1, employee: 1 }, { unique: true });

export const MonthlyPayroll: Model<IMonthlyPayroll> =
  mongoose.models.MonthlyPayroll ||
  mongoose.model<IMonthlyPayroll>("MonthlyPayroll", MonthlyPayrollSchema);


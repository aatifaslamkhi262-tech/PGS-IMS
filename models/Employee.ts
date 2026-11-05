import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "TERMINATED";
export type EmployeeDutyType = "FIXED_SHIFT" | "FLEXIBLE_HOURS";
export type EmployeeOffPolicy = "WEEKLY_FIXED" | "MONTHLY_QUOTA" | "NONE";

export interface IEmployee {
  _id?: Types.ObjectId;
  employeeCode: string;
  name: string;
  photoUrl?: string;
  designation: string;
  location?: Types.ObjectId;
  userId?: Types.ObjectId;
  cnicEncrypted?: string;
  cnicMasked?: string;
  phone: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bloodGroup?: string;
  joiningDate: Date;
  baseSalary: number;
  status: EmployeeStatus;

  // Custom Schedule & Off Rules per Employee
  shift?: Types.ObjectId;
  dutyType: EmployeeDutyType;
  shiftStartTime: string;     // e.g. "10:00"
  shiftEndTime: string;       // e.g. "20:00"
  requiredDailyHours: number; // e.g. 3, 8, 10
  breakMinutes: number;       // default 60
  graceMinutes: number;       // default 15
  halfDayMinutes: number;     // default 90
  crossesMidnight: boolean;   // default false

  offPolicy: EmployeeOffPolicy;
  weeklyOffDays: number[];    // 0=Sun..6=Sat (1 or 2 days per week)
  monthlyOffQuota: number;    // e.g. 1, 2, 4 offs per month
  monthlyHalfDayQuota?: number; // e.g. 1 or 2 half-days per month (counted at 50% target hours)
  holidayOffAllowed?: boolean; // true only for staff who get Gazetted/Public Holiday offs (e.g. Ayan Hashmi)

  // Backup 4-digit PIN (Hashed, locked 15m after 3 failed tries)
  pinHash?: string;
  hasPin: boolean;
  pinFailedAttempts: number;
  pinLockedUntil?: Date | null;

  // Active Card Quick Reference
  activeCardUid?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export type EmployeeDocument = Document & IEmployee;

const EmployeeSchema: Schema = new Schema(
  {
    employeeCode: {
      type: String,
      required: [true, "Employee code is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, "Employee name is required"],
      trim: true,
    },
    photoUrl: {
      type: String,
      default: "",
    },
    designation: {
      type: String,
      required: [true, "Designation is required"],
      trim: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    cnicEncrypted: {
      type: String,
      default: "",
    },
    cnicMasked: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    emergencyContactName: {
      type: String,
      trim: true,
      default: "",
    },
    emergencyContactPhone: {
      type: String,
      trim: true,
      default: "",
    },
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"],
      default: "Unknown",
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    baseSalary: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SUSPENDED", "TERMINATED"],
      default: "ACTIVE",
      index: true,
    },

    // Schedule & Off Policy
    shift: {
      type: Schema.Types.ObjectId,
      ref: "Shift",
    },
    dutyType: {
      type: String,
      enum: ["FIXED_SHIFT", "FLEXIBLE_HOURS"],
      default: "FIXED_SHIFT",
    },
    shiftStartTime: {
      type: String,
      default: "10:00",
    },
    shiftEndTime: {
      type: String,
      default: "20:00",
    },
    requiredDailyHours: {
      type: Number,
      default: 8,
      min: 0.5,
      max: 24,
    },
    breakMinutes: {
      type: Number,
      default: 60,
      min: 0,
    },
    graceMinutes: {
      type: Number,
      default: 15,
      min: 0,
    },
    halfDayMinutes: {
      type: Number,
      default: 180, // 3 hours late triggers half day
      min: 15,
    },
    crossesMidnight: {
      type: Boolean,
      default: false,
    },
    offPolicy: {
      type: String,
      enum: ["WEEKLY_FIXED", "MONTHLY_QUOTA", "NONE"],
      default: "WEEKLY_FIXED",
    },
    weeklyOffDays: {
      type: [Number],
      default: [0], // Sunday default
    },
    monthlyOffQuota: {
      type: Number,
      default: 4,
      min: 0,
      max: 31,
    },
    monthlyHalfDayQuota: {
      type: Number,
      default: 0,
      min: 0,
      max: 31,
    },
    holidayOffAllowed: {
      type: Boolean,
      default: false,
    },

    // Backup PIN
    pinHash: {
      type: String,
      default: "",
    },
    hasPin: {
      type: Boolean,
      default: false,
    },
    pinFailedAttempts: {
      type: Number,
      default: 0,
    },
    pinLockedUntil: {
      type: Date,
      default: null,
    },

    activeCardUid: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

EmployeeSchema.index({ name: 1, employeeCode: 1 });
EmployeeSchema.index({ location: 1, status: 1 });

export const Employee: Model<IEmployee> =
  mongoose.models.Employee || mongoose.model<IEmployee>("Employee", EmployeeSchema);


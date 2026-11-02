import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type AttendanceStatus =
  | "PRESENT"
  | "LATE"
  | "HALF_DAY"
  | "SHORT_HOURS"
  | "ABSENT"
  | "MISSING_CHECKOUT"
  | "WEEKLY_OFF"
  | "PAID_OFF"
  | "HOLIDAY"
  | "PRESENT_ON_OFF_DAY";

export type PunchMethod = "CARD_SCAN" | "PIN_BACKUP" | "HR_MANUAL";
export type ClaimedArrivalStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export interface IAttendanceBreak {
  outTime: Date;
  inTime?: Date | null;
  reason?: string;
  durationMinutes?: number;
}

export interface IAttendance {
  _id?: Types.ObjectId;
  employee: Types.ObjectId;
  date: string; // YYYY-MM-DD (shift start date)
  location?: Types.ObjectId | null;

  checkIn?: Date | null;
  checkOut?: Date | null;

  // Edge Case 1: Arrived before kiosk/system turned on
  claimedArrivalTime?: Date | null;
  claimedArrivalReason?: string;
  claimedArrivalStatus: ClaimedArrivalStatus;

  // Edge Case 2: Mid-day breaks / market / bank visits
  breaks: IAttendanceBreak[];
  totalBreakMinutes: number;

  // Calculated Duty Metrics
  workedMinutes: number;
  targetMinutes: number;
  shortMinutes: number;
  extraMinutes: number;
  lateMinutes: number;

  status: AttendanceStatus;
  punchMethod: PunchMethod;
  cardUidUsed?: string | null;
  flags: string[];
  notes?: string;

  correctedBy?: Types.ObjectId | null;
  correctedByName?: string;
  correctedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export type AttendanceDocument = Document & IAttendance;

const BreakSchema = new Schema(
  {
    outTime: { type: Date, required: true },
    inTime: { type: Date, default: null },
    reason: { type: String, default: "Short Out / Break" },
    durationMinutes: { type: Number, default: 0 },
  },
  { _id: false }
);

const AttendanceSchema: Schema = new Schema(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      default: null,
    },
    checkIn: {
      type: Date,
      default: null,
    },
    checkOut: {
      type: Date,
      default: null,
    },
    claimedArrivalTime: {
      type: Date,
      default: null,
    },
    claimedArrivalReason: {
      type: String,
      default: "",
    },
    claimedArrivalStatus: {
      type: String,
      enum: ["NONE", "PENDING", "APPROVED", "REJECTED"],
      default: "NONE",
    },
    breaks: {
      type: [BreakSchema],
      default: [],
    },
    totalBreakMinutes: {
      type: Number,
      default: 0,
    },
    workedMinutes: {
      type: Number,
      default: 0,
    },
    targetMinutes: {
      type: Number,
      default: 480, // 8h default
    },
    shortMinutes: {
      type: Number,
      default: 0,
    },
    extraMinutes: {
      type: Number,
      default: 0,
    },
    lateMinutes: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: [
        "PRESENT",
        "LATE",
        "HALF_DAY",
        "SHORT_HOURS",
        "ABSENT",
        "MISSING_CHECKOUT",
        "WEEKLY_OFF",
        "PAID_OFF",
        "HOLIDAY",
        "PRESENT_ON_OFF_DAY",
      ],
      default: "PRESENT",
      index: true,
    },
    punchMethod: {
      type: String,
      enum: ["CARD_SCAN", "PIN_BACKUP", "HR_MANUAL"],
      default: "CARD_SCAN",
    },
    cardUidUsed: {
      type: String,
      default: null,
    },
    flags: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      default: "",
    },
    correctedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    correctedByName: {
      type: String,
      default: "",
    },
    correctedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

AttendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ date: 1, status: 1 });

export const Attendance: Model<IAttendance> =
  mongoose.models.Attendance ||
  mongoose.model<IAttendance>("Attendance", AttendanceSchema);


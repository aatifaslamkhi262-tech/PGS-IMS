import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type OvertimeStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface IOvertimeRequest {
  _id?: Types.ObjectId;
  employee: Types.ObjectId;
  attendance?: Types.ObjectId | null;
  date: string; // YYYY-MM-DD
  extraMinutes: number; // minutes worked past shift
  approvedMinutes: number;
  rateMultiplier: number; // default 1.0 or 1.5
  reason: string;
  status: OvertimeStatus;

  approvedBy?: Types.ObjectId | null;
  approvedByName?: string;
  approvedAt?: Date | null;
  rejectionReason?: string;
  notes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export type OvertimeRequestDocument = Document & IOvertimeRequest;

const OvertimeRequestSchema: Schema = new Schema(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    attendance: {
      type: Schema.Types.ObjectId,
      ref: "Attendance",
      default: null,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    extraMinutes: {
      type: Number,
      required: true,
      default: 0,
    },
    approvedMinutes: {
      type: Number,
      default: 0,
    },
    rateMultiplier: {
      type: Number,
      default: 1.0,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedByName: {
      type: String,
      default: "",
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
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

OvertimeRequestSchema.index({ employee: 1, date: 1 }, { unique: true });

export const OvertimeRequest: Model<IOvertimeRequest> =
  mongoose.models.OvertimeRequest ||
  mongoose.model<IOvertimeRequest>("OvertimeRequest", OvertimeRequestSchema);


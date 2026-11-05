import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type LeaveType = "CASUAL" | "SICK" | "UNPAID";
export type LeaveStatus = "PENDING" | "RECOMMENDED" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface ILeaveRequest {
  _id?: Types.ObjectId;
  employee: Types.ObjectId;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  totalDays: number;
  reason: string;
  status: LeaveStatus;

  recommendedBy?: Types.ObjectId | null;
  recommendedByName?: string;
  recommendedAt?: Date | null;

  approvedBy?: Types.ObjectId | null;
  approvedByName?: string;
  approvedAt?: Date | null;

  rejectionReason?: string;
  appliedAt: Date;
  notes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export type LeaveRequestDocument = Document & ILeaveRequest;

const LeaveRequestSchema: Schema = new Schema(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    leaveType: {
      type: String,
      enum: ["CASUAL", "SICK", "UNPAID"],
      required: true,
      default: "CASUAL",
    },
    startDate: {
      type: String,
      required: true,
      index: true,
    },
    endDate: {
      type: String,
      required: true,
      index: true,
    },
    totalDays: {
      type: Number,
      required: true,
      min: 0.5,
      default: 1,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "RECOMMENDED", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    recommendedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    recommendedByName: {
      type: String,
      default: "",
    },
    recommendedAt: {
      type: Date,
      default: null,
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
    appliedAt: {
      type: Date,
      default: Date.now,
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

LeaveRequestSchema.index({ employee: 1, startDate: 1 });

export const LeaveRequest: Model<ILeaveRequest> =
  mongoose.models.LeaveRequest ||
  mongoose.model<ILeaveRequest>("LeaveRequest", LeaveRequestSchema);


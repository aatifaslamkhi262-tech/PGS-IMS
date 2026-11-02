import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type AuditModule =
  | "HR_ATTENDANCE"
  | "HR_CARD"
  | "HR_EMPLOYEE"
  | "HR_SHIFT_HOLIDAY"
  | "HR_PAYROLL"
  | "SALES";

export interface IHRAuditLog {
  _id?: Types.ObjectId;
  action: string;
  module: AuditModule;
  targetId?: string;
  targetLabel: string;
  valueBefore?: any;
  valueAfter?: any;
  reason: string;
  performedBy?: Types.ObjectId | null;
  performedByName: string;
  ipAddress?: string;
  previousHash: string;
  entryHash: string;
  createdAt?: Date;
}

export type HRAuditLogDocument = Document & IHRAuditLog;

const HRAuditLogSchema: Schema = new Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    module: {
      type: String,
      enum: [
        "HR_ATTENDANCE",
        "HR_CARD",
        "HR_EMPLOYEE",
        "HR_SHIFT_HOLIDAY",
        "HR_PAYROLL",
        "SALES",
      ],
      required: true,
      index: true,
    },
    targetId: {
      type: String,
      default: "",
      index: true,
    },
    targetLabel: {
      type: String,
      required: true,
    },
    valueBefore: {
      type: Schema.Types.Mixed,
      default: null,
    },
    valueAfter: {
      type: Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      required: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    performedByName: {
      type: String,
      required: true,
      default: "System",
    },
    ipAddress: {
      type: String,
      default: "127.0.0.1",
    },
    previousHash: {
      type: String,
      required: true,
      default: "GENESIS",
    },
    entryHash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

HRAuditLogSchema.index({ createdAt: -1 });
HRAuditLogSchema.index({ module: 1, createdAt: -1 });

export const HRAuditLog: Model<IHRAuditLog> =
  mongoose.models.HRAuditLog ||
  mongoose.model<IHRAuditLog>("HRAuditLog", HRAuditLogSchema);


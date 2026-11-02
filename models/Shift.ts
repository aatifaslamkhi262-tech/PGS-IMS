import mongoose, { Schema, Document, Model } from "mongoose";

export type ShiftType = "FIXED" | "FLEXIBLE_HOURS";

export interface IShift {
  name: string;
  code: string;
  shiftType: ShiftType;
  startTime: string; // e.g. "10:00"
  endTime: string;   // e.g. "20:00"
  paidDailyHours: number; // e.g. 8, 10, 3
  breakMinutes: number;   // e.g. 60
  graceMinutes: number;   // default 15
  halfDayThresholdMinutes: number; // default 90
  crossesMidnight: boolean;
  weeklyOffDays: number[]; // default [0] (Sunday)
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ShiftDocument = Document & IShift;

const ShiftSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Shift name is required"],
      trim: true,
    },
    code: {
      type: String,
      required: [true, "Shift code is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    shiftType: {
      type: String,
      enum: ["FIXED", "FLEXIBLE_HOURS"],
      default: "FIXED",
    },
    startTime: {
      type: String,
      default: "10:00",
    },
    endTime: {
      type: String,
      default: "20:00",
    },
    paidDailyHours: {
      type: Number,
      required: true,
      default: 8,
      min: 1,
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
    halfDayThresholdMinutes: {
      type: Number,
      default: 90,
      min: 15,
    },
    crossesMidnight: {
      type: Boolean,
      default: false,
    },
    weeklyOffDays: {
      type: [Number],
      default: [0],
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Shift: Model<IShift> =
  mongoose.models.Shift || mongoose.model<IShift>("Shift", ShiftSchema);


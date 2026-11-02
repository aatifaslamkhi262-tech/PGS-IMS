import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type HolidayType = "GAZETTED" | "COMPANY" | "OPTIONAL";

export interface IHoliday {
  name: string;
  date: string; // YYYY-MM-DD
  year: number;
  type: HolidayType;
  description?: string;
  createdBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type HolidayDocument = Document & IHoliday;

const HolidaySchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Holiday name is required"],
      trim: true,
    },
    date: {
      type: String,
      required: [true, "Holiday date (YYYY-MM-DD) is required"],
      unique: true,
      trim: true,
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["GAZETTED", "COMPANY", "OPTIONAL"],
      default: "GAZETTED",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

HolidaySchema.index({ year: 1, date: 1 });

export const Holiday: Model<IHoliday> =
  mongoose.models.Holiday || mongoose.model<IHoliday>("Holiday", HolidaySchema);


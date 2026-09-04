import mongoose, { Schema, Document, Model } from "mongoose";

export type LocationType = "Warehouse" | "Branch" | "Claim Godam";

export interface ILocation {
  name: string;
  code: string;
  type: LocationType;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type LocationDocument = Document & ILocation;

const LocationSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Location Name is required"],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: [true, "Location Code is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    type: {
      type: String,
      enum: ["Warehouse", "Branch", "Claim Godam"],
      required: [true, "Location Type is required"],
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

LocationSchema.index({ type: 1 });

export const Location: Model<ILocation> =
  mongoose.models.Location || mongoose.model<ILocation>("Location", LocationSchema);

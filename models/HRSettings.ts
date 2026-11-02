import mongoose, { Schema, Document, Model } from "mongoose";

export interface IHRSettings {
  key: string;
  signatureDataUrl?: string;
  signatoryTitle?: string;
  updatedBy?: string;
  updatedAt?: Date;
}

export type HRSettingsDocument = Document & IHRSettings;

const HRSettingsSchema: Schema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "HR_CARD_SETTINGS",
    },
    signatureDataUrl: {
      type: String,
      default: "",
    },
    signatoryTitle: {
      type: String,
      default: "AUTHORIZED SIGN",
    },
    updatedBy: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export const HRSettings: Model<HRSettingsDocument> =
  mongoose.models.HRSettings ||
  mongoose.model<HRSettingsDocument>("HRSettings", HRSettingsSchema);

export default HRSettings;


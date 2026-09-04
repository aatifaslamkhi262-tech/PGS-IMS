import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISupplier {
  name: string;
  code: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SupplierDocument = Document & ISupplier;

const SupplierSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Supplier Name is required"],
      trim: true,
    },
    code: {
      type: String,
      required: [true, "Supplier Code is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
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

// Enforce unique index on supplier name
SupplierSchema.index({ name: 1 }, { unique: true });

export const Supplier: Model<ISupplier> =
  mongoose.models.Supplier || mongoose.model<ISupplier>("Supplier", SupplierSchema);

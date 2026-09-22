import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ICustomer {
  _id?: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  advanceBalance: number;
  outstandingBalance: number;
  storeCredit: number;
  notes?: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CustomerDocument = Document & ICustomer;

const CustomerSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, "Customer phone number is required"],
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
    advanceBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    outstandingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    storeCredit: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
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

// Unique index on phone number for active customers
CustomerSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true },
  }
);

export const Customer: Model<ICustomer> =
  mongoose.models.Customer || mongoose.model<ICustomer>("Customer", CustomerSchema);

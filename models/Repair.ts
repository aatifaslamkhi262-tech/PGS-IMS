import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IRepairPartItem {
  product: Types.ObjectId;
  productName: string;
  sku: string;
  barcode?: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  lineTotal: number;
}

export type RepairStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "DELIVERED" | "CANCELLED";

export interface IRepair extends Document {
  repairNumber: string; // e.g. REP-20261016-0001
  customer?: Types.ObjectId;
  customerName: string;
  customerPhone: string;
  productName: string; // Customer's device/product name (e.g. "PS5 Slim Disc")
  serialNumber?: string; // Customer's device serial number
  faultReason: string; // Reason / Issue (e.g. "HDMI port broken, no display")
  parts: IRepairPartItem[];
  laborCost: number; // Dukaan repairing / labor fee
  repairCost: number; // Internal repair cost / kharcha incurred by shop
  partsCostTotal: number; // Cost value of parts used
  partsTotal: number; // Selling value of parts used
  totalAmount: number; // laborCost + partsTotal
  paidAmount: number; // Amount paid by customer
  balanceDue: number; // totalAmount - paidAmount
  paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER" | "ONLINE_GATEWAY";
  status: RepairStatus;
  repairedBy: string; // Technician / Staff name who did the repair
  technicianId?: Types.ObjectId;
  location: Types.ObjectId;
  locationName: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const RepairPartItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    barcode: { type: String },
    quantity: { type: Number, required: true, default: 1, min: 1 },
    unitCost: { type: Number, required: true, default: 0, min: 0 },
    unitPrice: { type: Number, required: true, default: 0, min: 0 },
    totalCost: { type: Number, required: true, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: true }
);

const RepairSchema: Schema = new Schema(
  {
    repairNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerPhone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    serialNumber: {
      type: String,
      trim: true,
      index: true,
      default: "",
    },
    faultReason: {
      type: String,
      required: true,
      trim: true,
    },
    parts: [RepairPartItemSchema],
    laborCost: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    repairCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    partsCostTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    partsTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    paidAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    balanceDue: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["CASH", "CARD", "BANK_TRANSFER", "ONLINE_GATEWAY"],
      default: "CASH",
    },
    status: {
      type: String,
      enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "DELIVERED", "CANCELLED"],
      default: "COMPLETED",
      index: true,
    },
    repairedBy: {
      type: String,
      required: true,
      trim: true,
      default: "In-House Technician",
      index: true,
    },
    technicianId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    locationName: {
      type: String,
      required: true,
      default: "Main Counter",
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Repair: Model<IRepair> =
  mongoose.models.Repair || mongoose.model<IRepair>("Repair", RepairSchema);

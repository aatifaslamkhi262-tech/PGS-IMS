import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type StockAuditStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

export interface IMissingSerialItem {
  product: Types.ObjectId;
  productName: string;
  serialNumber: string;
  condition: string;
  unitCost: number;
}

export interface ICrossBranchSerialItem {
  product: Types.ObjectId;
  productName: string;
  serialNumber: string;
  condition: string;
  fromLocation: Types.ObjectId;
  fromLocationName: string;
  toLocation: Types.ObjectId;
  toLocationName: string;
  unitCost: number;
  resolutionAction?: "TRANSFER_TO_DESTINATION" | "RETURN_TO_ORIGIN";
}

export interface IUnregisteredSerialItem {
  serialNumber: string;
  product?: Types.ObjectId;
  productName?: string;
  condition?: string;
  unitCost?: number;
}

export interface IReactivatedSerialItem {
  serialNumber: string;
  product: Types.ObjectId;
  productName: string;
  previousStatus: string;
  condition: string;
  unitCost: number;
}

export interface IItemVariance {
  product: Types.ObjectId;
  productName: string;
  condition: string;
  systemQuantity: number;
  physicalQuantity: number;
  variance: number; // physicalQuantity - systemQuantity
  unitCost: number;
  totalCostDelta: number; // variance * unitCost
}

export interface IStockAudit {
  _id?: Types.ObjectId;
  auditNumber: string; // e.g. AUD-20261021-001
  location?: Types.ObjectId | null;
  locationName: string;
  isConsolidated?: boolean;
  status: StockAuditStatus;
  performedBy: string;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;
  notes?: string;
  scannedSerials: string[];
  missingSerials: IMissingSerialItem[];
  crossBranchSerials: ICrossBranchSerialItem[];
  unregisteredSerials: IUnregisteredSerialItem[];
  reactivatedSerials: IReactivatedSerialItem[];
  itemVariances: IItemVariance[];
  summary: {
    totalMissingUnits: number;
    totalSurplusUnits: number;
    totalCrossBranchUnits: number;
    netCostDelta: number;
  };
  auditScope?: "ALL" | "SERIALIZED_ONLY" | "NON_SERIALIZED_ONLY";
  createdAt?: Date;
  updatedAt?: Date;
}

export type StockAuditDocument = Document & IStockAudit;

const StockAuditSchema: Schema = new Schema(
  {
    auditNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: false,
      index: true,
    },
    isConsolidated: {
      type: Boolean,
      default: false,
    },
    locationName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"],
      default: "DRAFT",
      index: true,
    },
    auditScope: {
      type: String,
      enum: ["ALL", "SERIALIZED_ONLY", "NON_SERIALIZED_ONLY"],
      default: "ALL",
    },
    performedBy: {
      type: String,
      required: true,
      trim: true,
    },
    approvedBy: {
      type: String,
      trim: true,
    },
    approvedAt: {
      type: Date,
    },
    rejectedBy: {
      type: String,
      trim: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    scannedSerials: [{ type: String, trim: true }],
    missingSerials: [
      {
        product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
        productName: { type: String, required: true },
        serialNumber: { type: String, required: true },
        condition: { type: String, default: "New" },
        unitCost: { type: Number, default: 0 },
      },
    ],
    crossBranchSerials: [
      {
        product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
        productName: { type: String, required: true },
        serialNumber: { type: String, required: true },
        condition: { type: String, default: "New" },
        fromLocation: { type: Schema.Types.ObjectId, ref: "Location", required: true },
        fromLocationName: { type: String, required: true },
        toLocation: { type: Schema.Types.ObjectId, ref: "Location", required: true },
        toLocationName: { type: String, required: true },
        unitCost: { type: Number, default: 0 },
      },
    ],
    unregisteredSerials: [
      {
        serialNumber: { type: String, required: true },
        product: { type: Schema.Types.ObjectId, ref: "Product" },
        productName: { type: String },
        condition: { type: String, default: "New" },
        unitCost: { type: Number, default: 0 },
      },
    ],
    reactivatedSerials: [
      {
        serialNumber: { type: String, required: true },
        product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
        productName: { type: String, required: true },
        previousStatus: { type: String, required: true },
        condition: { type: String, default: "New" },
        unitCost: { type: Number, default: 0 },
      },
    ],
    itemVariances: [
      {
        product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
        productName: { type: String, required: true },
        condition: { type: String, default: "New" },
        systemQuantity: { type: Number, required: true },
        physicalQuantity: { type: Number, required: true },
        variance: { type: Number, required: true },
        unitCost: { type: Number, default: 0 },
        totalCostDelta: { type: Number, default: 0 },
      },
    ],
    summary: {
      totalMissingUnits: { type: Number, default: 0 },
      totalSurplusUnits: { type: Number, default: 0 },
      totalCrossBranchUnits: { type: Number, default: 0 },
      netCostDelta: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

export const StockAudit: Model<StockAuditDocument> =
  mongoose.models.StockAudit ||
  mongoose.model<StockAuditDocument>("StockAudit", StockAuditSchema);

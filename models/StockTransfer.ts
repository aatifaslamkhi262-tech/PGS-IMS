import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type TransferType = "Normal" | "Return" | "Direct_Reject";

export type TransferStatus =
  | "Draft"
  | "Pending_Approval"
  | "Approved"
  | "Dispatched"
  | "Received"
  | "Rejected"
  | "Cancelled";

export interface ITransferItem {
  product: Types.ObjectId;
  condition: string; // "New" | "Used"
  quantity: number;
  serialNumbers?: string[];
}

export interface IDamagedReceiveItem {
  product: Types.ObjectId;
  productName?: string;
  serialNumber?: string;
  condition: string;
  damageType: "Damaged" | "Claim";
  reason: string;
  reportedBy: string;
  reportedAt: Date;
}

export interface IStockTransfer {
  _id?: Types.ObjectId;
  transferNumber: string; // e.g. TRF-20260827-001
  type: TransferType;
  sourceLocation: Types.ObjectId;
  destinationLocation: Types.ObjectId;
  status: TransferStatus;
  items: ITransferItem[];
  reason?: string;
  notes?: string;

  // Custody & Accountability Audit Trail
  createdBy: string; // username
  approvedBy?: string; // username
  rejectedBy?: string; // username
  rejectionReason?: string;

  // Dispatch Audit
  dispatchedBy?: string; // action logged-in username
  carrierUser?: Types.ObjectId; // User ObjectId
  carrierName?: string; // Snapshot of carrier full name
  carrierUsername?: string; // Snapshot of carrier username
  dispatchedAt?: Date;

  // Receiving Audit
  receivedBy?: string; // username
  receivedAt?: Date;
  damagedReceiveLogs?: IDamagedReceiveItem[];

  // Linked Transfer Reference (for Return to Source or Direct Reject)
  linkedOriginalTransfer?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export type StockTransferDocument = Document & IStockTransfer;

const DamagedReceiveItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: { type: String, trim: true },
    serialNumber: { type: String, trim: true },
    condition: { type: String, default: "New" },
    damageType: { type: String, enum: ["Damaged", "Claim"], required: true },
    reason: { type: String, required: true, trim: true },
    reportedBy: { type: String, required: true },
    reportedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TransferItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
    },
    condition: {
      type: String,
      required: [true, "Condition is required"],
      enum: ["New", "Used"],
      default: "New",
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    serialNumbers: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const StockTransferSchema: Schema = new Schema(
  {
    transferNumber: {
      type: String,
      required: [true, "Transfer Number is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["Normal", "Return", "Direct_Reject"],
      default: "Normal",
      required: true,
    },
    sourceLocation: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: [true, "Source Location is required"],
      index: true,
    },
    destinationLocation: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: [true, "Destination Location is required"],
      index: true,
    },
    status: {
      type: String,
      enum: ["Draft", "Pending_Approval", "Approved", "Dispatched", "Received", "Rejected", "Cancelled"],
      default: "Draft",
      index: true,
    },
    items: {
      type: [TransferItemSchema],
      required: true,
      validate: [(val: any[]) => val.length > 0, "At least one item is required"],
    },
    reason: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: String,
      required: [true, "Created by username is required"],
    },
    approvedBy: {
      type: String,
    },
    rejectedBy: {
      type: String,
    },
    rejectionReason: {
      type: String,
    },
    dispatchedBy: {
      type: String,
    },
    carrierUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    carrierName: {
      type: String,
      trim: true,
    },
    carrierUsername: {
      type: String,
      trim: true,
    },
    dispatchedAt: {
      type: Date,
    },
    receivedBy: {
      type: String,
    },
    receivedAt: {
      type: Date,
    },
    damagedReceiveLogs: {
      type: [DamagedReceiveItemSchema],
      default: [],
    },
    linkedOriginalTransfer: {
      type: Schema.Types.ObjectId,
      ref: "StockTransfer",
    },
  },
  {
    timestamps: true,
  }
);

StockTransferSchema.index({ createdAt: -1 });

export const StockTransfer: Model<IStockTransfer> =
  mongoose.models.StockTransfer || mongoose.model<IStockTransfer>("StockTransfer", StockTransferSchema);

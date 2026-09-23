import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type CreationMode = "SALESMAN_CHECKOUT" | "WAREHOUSE_QUICK_SALE" | "DIRECT_COUNTER";
export type SaleSource =
  | "SALESMAN"
  | "DIRECT_COUNTER"
  | "WEBSITE"
  | "WHATSAPP"
  | "INSTAGRAM"
  | "PHONE"
  | "ADVANCE_BOOKING"
  | "EXCHANGE";

export type SaleStatus =
  | "DRAFT"
  | "CHECKOUT"
  | "PROCESSING"
  | "PAYMENT_PENDING"
  | "PAID"
  | "INVOICED"
  | "HANDED_OVER"
  | "COMPLETED"
  | "CANCELLED";

export interface ISaleItem {
  product: Types.ObjectId;
  productName: string;
  sku: string;
  barcode: string;
  condition: string;
  quantity: number;
  returnedQuantity?: number;
  serialNumbers?: string[];
  unitCost: number; // Exact COGS for item
  unitPrice: number; // Selling price per unit
  minSellingPrice: number; // Min allowed selling price
  discountAmount: number;
  lineTotal: number;
  grossProfit: number;
}

export interface ISale {
  _id?: Types.ObjectId;
  saleNumber: string; // e.g. SALE-20260915-001
  creationMode: CreationMode;
  saleSource: SaleSource;
  location: Types.ObjectId; // Branch / Warehouse ID
  locationName: string;
  salesman?: Types.ObjectId;
  salesmanName?: string;
  customer?: Types.ObjectId;
  customerName?: string;
  customerPhone?: string;
  items: ISaleItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  deliveryCharges: number;
  totalAmount: number;
  totalPaid: number;
  balanceDue: number;
  totalCost: number; // Total COGS
  netProfit: number; // Total Profit (Total - COGS - Direct Expenses)
  status: SaleStatus;
  processingStartedAt?: Date;
  processingAttemptId?: string;
  notes?: string;
  createdBy: string; // username
  billedBy?: string;
  paymentReceivedBy?: string;
  completedBy?: string;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SaleDocument = Document & ISale;

const SaleItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    barcode: { type: String, required: true },
    condition: { type: String, required: true, default: "New" },
    quantity: { type: Number, required: true, min: 1 },
    returnedQuantity: { type: Number, default: 0, min: 0 },
    serialNumbers: { type: [String], default: [] },
    unitCost: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    minSellingPrice: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    grossProfit: { type: Number, required: true },
  },
  { _id: false }
);

const SaleSchema: Schema = new Schema(
  {
    saleNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    creationMode: {
      type: String,
      enum: ["SALESMAN_CHECKOUT", "WAREHOUSE_QUICK_SALE", "DIRECT_COUNTER"],
      required: true,
    },
    saleSource: {
      type: String,
      enum: [
        "SALESMAN",
        "DIRECT_COUNTER",
        "WEBSITE",
        "WHATSAPP",
        "INSTAGRAM",
        "PHONE",
        "ADVANCE_BOOKING",
        "EXCHANGE",
      ],
      required: true,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
      index: true,
    },
    locationName: { type: String, required: true },
    salesman: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    salesmanName: { type: String, trim: true },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
    },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    items: {
      type: [SaleItemSchema],
      validate: [(val: any[]) => val.length > 0, "Sale must have at least 1 item"],
    },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    deliveryCharges: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
    netProfit: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "CHECKOUT",
        "PROCESSING",
        "PAYMENT_PENDING",
        "PAID",
        "INVOICED",
        "HANDED_OVER",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "CHECKOUT",
      index: true,
    },
    processingStartedAt: { type: Date },
    processingAttemptId: { type: String },
    notes: { type: String, trim: true },
    createdBy: { type: String, required: true },
    billedBy: { type: String },
    paymentReceivedBy: { type: String },
    completedBy: { type: String },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

export const Sale: Model<ISale> =
  mongoose.models.Sale || mongoose.model<ISale>("Sale", SaleSchema);

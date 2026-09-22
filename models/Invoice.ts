import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IInvoiceItem {
  product: Types.ObjectId;
  productName: string;
  sku: string;
  barcode: string;
  condition: string;
  quantity: number;
  serialNumbers?: string[];
  unitPrice: number;
  lineTotal: number;
}

export interface IInvoice {
  _id?: Types.ObjectId;
  invoiceNumber: string; // e.g. INV-20260915-001
  sale: Types.ObjectId; // Reference to Sale document
  saleNumber: string;
  location: Types.ObjectId;
  locationName: string;
  customerName?: string;
  customerPhone?: string;
  salesmanName?: string;
  items: IInvoiceItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  deliveryCharges: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  billedBy: string; // username
  printedCount: number;
  lastPrintedAt?: Date;
  status: "ISSUED" | "CANCELLED";
  createdAt?: Date;
  updatedAt?: Date;
}

export type InvoiceDocument = Document & IInvoice;

const InvoiceItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    barcode: { type: String, required: true },
    condition: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    serialNumbers: { type: [String], default: [] },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const InvoiceSchema: Schema = new Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    sale: {
      type: Schema.Types.ObjectId,
      ref: "Sale",
      required: true,
      index: true,
    },
    saleNumber: { type: String, required: true },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    locationName: { type: String, required: true },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    salesmanName: { type: String, trim: true },
    items: { type: [InvoiceItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    deliveryCharges: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    billedBy: { type: String, required: true },
    printedCount: { type: Number, default: 0 },
    lastPrintedAt: { type: Date },
    status: {
      type: String,
      enum: ["ISSUED", "CANCELLED"],
      default: "ISSUED",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Invoice: Model<IInvoice> =
  mongoose.models.Invoice || mongoose.model<IInvoice>("Invoice", InvoiceSchema);

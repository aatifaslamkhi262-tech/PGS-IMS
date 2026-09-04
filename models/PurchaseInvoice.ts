import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type PurchaseInvoiceStatus =
  | "Draft"
  | "Pending_Approval"
  | "Approved"
  | "Rejected"
  | "Ready_For_Receiving"
  | "Receiving"
  | "Receiving_Pending_Approval"
  | "Receiving_Approved"
  | "Inventory_Updated";

export interface IRejectionHistory {
  rejectedBy: string;
  rejectedAt: Date;
  reason: string;
}

export interface IPurchaseInvoiceItem {
  product: Types.ObjectId;
  name: string;
  sku: string;
  barcode: string;
  condition: string;
  brand?: string;
  modelNumber?: string;
  color?: string;
  quantity: number;
  unitCost: number;
  amount: number;
  sellingPrice: number;
  minSellingPrice: number;
  serialNumbers?: string[]; // Extensible placeholder for future warehouse receiving
}

export interface IPurchaseInvoice {
  invoiceNumber: string;
  supplier: Types.ObjectId;
  invoiceDate: Date;
  status: PurchaseInvoiceStatus;
  items: IPurchaseInvoiceItem[];
  subtotal: number;
  total: number;
  notes?: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  rejectionHistory?: IRejectionHistory[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type PurchaseInvoiceDocument = Document & IPurchaseInvoice;

const PurchaseInvoiceItemSchema = new Schema<IPurchaseInvoiceItem>({
  product: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: [true, "Product reference is required"],
  },
  name: {
    type: String,
    required: [true, "Product Name snapshot is required"],
  },
  sku: {
    type: String,
    required: [true, "Product SKU snapshot is required"],
  },
  barcode: {
    type: String,
    required: [true, "Product Barcode snapshot is required"],
  },
  condition: {
    type: String,
    required: [true, "Product Condition snapshot is required"],
  },
  brand: {
    type: String,
    default: "",
  },
  modelNumber: {
    type: String,
    default: "",
  },
  color: {
    type: String,
    default: "Unspecified",
  },
  quantity: {
    type: Number,
    required: [true, "Quantity is required"],
    min: [1, "Quantity must be greater than 0"],
  },
  unitCost: {
    type: Number,
    required: [true, "Unit Cost is required"],
    min: [0, "Unit Cost cannot be negative"],
  },
  amount: {
    type: Number,
    required: [true, "Line Amount is required"],
    min: [0, "Line Amount cannot be negative"],
  },
  sellingPrice: {
    type: Number,
    required: [true, "Selling Price is required"],
    min: [0, "Selling Price cannot be negative"],
    default: 0,
  },
  minSellingPrice: {
    type: Number,
    required: [true, "Minimum Selling Price is required"],
    min: [0, "Minimum Selling Price cannot be negative"],
    default: 0,
  },
  serialNumbers: {
    type: [String],
    default: [],
  },
});

const PurchaseInvoiceSchema = new Schema<IPurchaseInvoice>(
  {
    invoiceNumber: {
      type: String,
      required: [true, "Invoice Number is required"],
      unique: true,
      trim: true,
    },
    supplier: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: [true, "Supplier reference is required"],
    },
    invoiceDate: {
      type: Date,
      required: [true, "Invoice Date is required"],
      default: Date.now,
    },
    status: {
      type: String,
      enum: [
        "Draft",
        "Pending_Approval",
        "Approved",
        "Rejected",
        "Ready_For_Receiving",
        "Receiving",
        "Receiving_Pending_Approval",
        "Receiving_Approved",
        "Inventory_Updated"
      ],
      default: "Draft",
    },
    items: {
      type: [PurchaseInvoiceItemSchema],
      required: [true, "Invoice items are required"],
      validate: {
        validator: (val: any[]) => val && val.length > 0,
        message: "Invoice must have at least one product line item",
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, "Subtotal cannot be negative"],
    },
    total: {
      type: Number,
      required: true,
      min: [0, "Total cannot be negative"],
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: String,
      required: [true, "Creator username is required"],
    },
    approvedBy: {
      type: String,
    },
    approvedAt: {
      type: Date,
    },
    rejectedBy: {
      type: String,
    },
    rejectedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    rejectionHistory: {
      type: [
        {
          rejectedBy: { type: String, required: true },
          rejectedAt: { type: Date, required: true },
          reason: { type: String, required: true },
        }
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookup/reporting
PurchaseInvoiceSchema.index({ supplier: 1 });
PurchaseInvoiceSchema.index({ status: 1 });
PurchaseInvoiceSchema.index({ invoiceDate: 1 });

export const PurchaseInvoice: Model<IPurchaseInvoice> =
  mongoose.models.PurchaseInvoice ||
  mongoose.model<IPurchaseInvoice>("PurchaseInvoice", PurchaseInvoiceSchema);

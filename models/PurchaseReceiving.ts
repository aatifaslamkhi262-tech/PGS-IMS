import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type PurchaseReceivingStatus = "Draft" | "Pending_Approval" | "Approved" | "Rejected";

export interface IReceivingItem {
  product: Types.ObjectId;
  name: string;
  sku: string;
  barcode: string;
  condition: string;
  brand?: string;
  modelNumber?: string;
  color?: string;
  quantityReceived: number;
  serialNumbers: string[]; // Scanned serials
}

export interface IPurchaseReceiving {
  receivingNumber: string;
  purchaseInvoice: Types.ObjectId;
  location: Types.ObjectId; // Destination Location (e.g. WH, G17)
  status: PurchaseReceivingStatus;
  items: IReceivingItem[];
  notes?: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PurchaseReceivingDocument = Document & IPurchaseReceiving;

const ReceivingItemSchema = new Schema<IReceivingItem>({
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
  quantityReceived: {
    type: Number,
    required: [true, "Quantity received is required"],
    min: [1, "Quantity received must be greater than 0"],
  },
  serialNumbers: {
    type: [String],
    default: [],
  },
});

const PurchaseReceivingSchema = new Schema<IPurchaseReceiving>(
  {
    receivingNumber: {
      type: String,
      required: [true, "Receiving Number is required"],
      unique: true,
      trim: true,
    },
    purchaseInvoice: {
      type: Schema.Types.ObjectId,
      ref: "PurchaseInvoice",
      required: [true, "Purchase Invoice reference is required"],
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: [true, "Destination location is required"],
    },
    status: {
      type: String,
      enum: ["Draft", "Pending_Approval", "Approved", "Rejected"],
      default: "Draft",
    },
    items: {
      type: [ReceivingItemSchema],
      required: [true, "Receiving items are required"],
      validate: {
        validator: (val: any[]) => val && val.length > 0,
        message: "Receiving must have at least one product line item",
      },
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
  },
  {
    timestamps: true,
  }
);

PurchaseReceivingSchema.index({ purchaseInvoice: 1 });
PurchaseReceivingSchema.index({ location: 1 });
PurchaseReceivingSchema.index({ status: 1 });

export const PurchaseReceiving: Model<IPurchaseReceiving> =
  mongoose.models.PurchaseReceiving ||
  mongoose.model<IPurchaseReceiving>("PurchaseReceiving", PurchaseReceivingSchema);

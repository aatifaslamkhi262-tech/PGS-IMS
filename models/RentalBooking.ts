import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IRentalBookingItem {
  product: Types.ObjectId;
  productName: string;
  sku: string;
  serialNumber?: string;
  condition?: string;
  depositPaid: number;
  perDayRate: number;
  rentedAt: Date;
  returnedAt?: Date;
  accruedRent?: number;
  netRefundPaid?: number;
  status: "ON_RENT" | "RETURNED";
}

export interface ITopUpEntry {
  date: Date;
  amount: number;
  notes?: string;
  addedBy: string;
}

export interface IRentalBooking {
  _id?: Types.ObjectId;
  bookingNumber: string; // e.g. RENT-202609-0012
  location: Types.ObjectId;
  locationName: string;
  salesman?: Types.ObjectId;
  salesmanName?: string;
  customer?: Types.ObjectId;
  customerName?: string;
  customerPhone?: string;
  items: IRentalBookingItem[];
  totalDepositHeld: number;
  totalRentRealized: number;
  topUpHistory: ITopUpEntry[];
  status: "ACTIVE" | "PARTIALLY_RETURNED" | "COMPLETED";
  notes?: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type RentalBookingDocument = Document & IRentalBooking;

const RentalBookingItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    serialNumber: { type: String },
    condition: { type: String, default: "Used" },
    depositPaid: { type: Number, required: true, default: 0 },
    perDayRate: { type: Number, required: true, default: 0 },
    rentedAt: { type: Date, default: Date.now },
    returnedAt: { type: Date },
    accruedRent: { type: Number, default: 0 },
    netRefundPaid: { type: Number, default: 0 },
    status: { type: String, enum: ["ON_RENT", "RETURNED"], default: "ON_RENT" },
  },
  { _id: true }
);

const TopUpEntrySchema = new Schema(
  {
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    notes: { type: String },
    addedBy: { type: String, required: true },
  },
  { _id: false }
);

const RentalBookingSchema: Schema = new Schema(
  {
    bookingNumber: { type: String, required: true, unique: true, index: true },
    location: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    locationName: { type: String, required: true },
    salesman: { type: Schema.Types.ObjectId, ref: "User" },
    salesmanName: { type: String, default: "Direct Counter" },
    customer: { type: Schema.Types.ObjectId, ref: "Customer" },
    customerName: { type: String, default: "Walk-in Customer" },
    customerPhone: { type: String },
    items: [RentalBookingItemSchema],
    totalDepositHeld: { type: Number, required: true, default: 0 },
    totalRentRealized: { type: Number, default: 0 },
    topUpHistory: [TopUpEntrySchema],
    status: {
      type: String,
      enum: ["ACTIVE", "PARTIALLY_RETURNED", "COMPLETED"],
      default: "ACTIVE",
      index: true,
    },
    notes: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

export const RentalBooking: Model<RentalBookingDocument> =
  mongoose.models.RentalBooking ||
  mongoose.model<RentalBookingDocument>("RentalBooking", RentalBookingSchema);

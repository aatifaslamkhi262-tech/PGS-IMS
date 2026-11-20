import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type SupplierLedgerEntryType =
  | "BILL_IN"
  | "PAYMENT"
  | "SR_RETURN"
  | "OPENING_BALANCE"
  | "ADJUSTMENT";

export interface ISupplierLedgerEntry {
  _id?: Types.ObjectId;
  supplier: Types.ObjectId;
  date: Date;
  type: SupplierLedgerEntryType;
  referenceNumber?: string;
  particulars: string;
  branchName?: string;
  debit: number; // Increases payable owed to supplier (e.g. Bill In)
  credit: number; // Decreases payable owed to supplier (e.g. Online/Cash Payment or S/R Return)
  paymentMethod?: "CASH" | "ONLINE" | "BANK_TRANSFER" | "CHEQUE" | "SR_RETURN";
  bankName?: string;
  transactionId?: string;
  attachmentUrl?: string;
  notes?: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SupplierLedgerDocument = Document & ISupplierLedgerEntry;

const SupplierLedgerSchema = new Schema<ISupplierLedgerEntry>(
  {
    supplier: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    type: {
      type: String,
      enum: ["BILL_IN", "PAYMENT", "SR_RETURN", "OPENING_BALANCE", "ADJUSTMENT"],
      required: true,
    },
    referenceNumber: {
      type: String,
      trim: true,
    },
    particulars: {
      type: String,
      required: true,
      trim: true,
    },
    branchName: {
      type: String,
      trim: true,
      default: "P.G.S",
    },
    debit: {
      type: Number,
      default: 0,
      min: 0,
    },
    credit: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["CASH", "ONLINE", "BANK_TRANSFER", "CHEQUE", "SR_RETURN"],
    },
    bankName: {
      type: String,
      trim: true,
    },
    transactionId: {
      type: String,
      trim: true,
    },
    attachmentUrl: {
      type: String,
      trim: true,
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

export const SupplierLedger: Model<ISupplierLedgerEntry> =
  mongoose.models.SupplierLedger ||
  mongoose.model<ISupplierLedgerEntry>("SupplierLedger", SupplierLedgerSchema);

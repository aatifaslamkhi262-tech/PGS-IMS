import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type CardStatus = "ACTIVE" | "BLOCKED" | "REPLACED_LOST" | "EXPIRED";
export type CardReplacementReason = "INITIAL" | "LOST" | "DAMAGED" | "NAME_CHANGE" | "OTHER";
export type CardFeeSettlement = "NONE" | "CASH" | "PAYROLL_DEDUCTION";

export interface IEmployeeCard {
  _id?: Types.ObjectId;
  cardUid: string;
  employee: Types.ObjectId;
  status: CardStatus;
  issueDate: Date;
  issuedBy?: Types.ObjectId;
  issuedByName?: string;
  expiryDate?: Date | null;
  blockedAt?: Date | null;
  blockedBy?: Types.ObjectId | null;
  blockedByName?: string;
  blockReason?: string;
  replacementReason: CardReplacementReason;
  replacementNotes?: string;
  replacementFee: number;
  feeSettlementMode: CardFeeSettlement;
  replacedByCardUid?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type EmployeeCardDocument = Document & IEmployeeCard;

const EmployeeCardSchema: Schema = new Schema(
  {
    cardUid: {
      type: String,
      required: [true, "Card UID is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    employee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED", "REPLACED_LOST", "EXPIRED"],
      default: "ACTIVE",
      index: true,
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    issuedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    issuedByName: {
      type: String,
      default: "System",
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    blockedAt: {
      type: Date,
      default: null,
    },
    blockedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    blockedByName: {
      type: String,
      default: "",
    },
    blockReason: {
      type: String,
      default: "",
    },
    replacementReason: {
      type: String,
      enum: ["INITIAL", "LOST", "DAMAGED", "NAME_CHANGE", "OTHER"],
      default: "INITIAL",
    },
    replacementNotes: {
      type: String,
      default: "",
    },
    replacementFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    feeSettlementMode: {
      type: String,
      enum: ["NONE", "CASH", "PAYROLL_DEDUCTION"],
      default: "NONE",
    },
    replacedByCardUid: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

EmployeeCardSchema.index({ employee: 1, status: 1 });

export const EmployeeCard: Model<IEmployeeCard> =
  mongoose.models.EmployeeCard ||
  mongoose.model<IEmployeeCard>("EmployeeCard", EmployeeCardSchema);


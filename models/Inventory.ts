import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IInventory {
  product: Types.ObjectId;
  location: Types.ObjectId;
  condition: string; // "New" | "Used"
  quantity: number;
  serialTracking: boolean;
  status: "In Stock" | "Out of Stock";
  createdAt?: Date;
  updatedAt?: Date;
}

export type InventoryDocument = Document & IInventory;

const InventorySchema: Schema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product reference is required"],
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: [true, "Location reference is required"],
    },
    condition: {
      type: String,
      required: [true, "Condition is required"],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
      default: 0,
    },
    serialTracking: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["In Stock", "Out of Stock"],
      default: "Out of Stock",
    },
  },
  {
    timestamps: true,
  }
);

// Unique index: a product can have only one inventory record per location & condition
InventorySchema.index({ product: 1, location: 1, condition: 1 }, { unique: true });
InventorySchema.index({ status: 1 });

// Helper to determine status before save
InventorySchema.pre("save", function (this: any) {
  this.status = this.quantity > 0 ? "In Stock" : "Out of Stock";
});

export const Inventory: Model<IInventory> =
  mongoose.models.Inventory || mongoose.model<IInventory>("Inventory", InventorySchema);

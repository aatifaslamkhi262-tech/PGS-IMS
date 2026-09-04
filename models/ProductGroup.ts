import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IProductGroup extends Document {
  name: string;
  category?: Types.ObjectId;
  description?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductGroupSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Product Group name is required"],
      trim: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
    },
    description: {
      type: String,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure unique group name
ProductGroupSchema.index({ name: 1 }, { unique: true });

export const ProductGroup: Model<IProductGroup> =
  mongoose.models.ProductGroup ||
  mongoose.model<IProductGroup>("ProductGroup", ProductGroupSchema);

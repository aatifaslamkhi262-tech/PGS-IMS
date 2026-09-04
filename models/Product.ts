import mongoose, { Schema, Document, Model, Types } from "mongoose";
import {
  DEFAULT_PRODUCT_CONDITION,
  PRODUCT_CONDITIONS,
  type ProductCondition,
} from "@/lib/productCondition";

export type { ProductCondition };

export interface ProductImage {
  url: string;
  publicId: string;
  isPrimary: boolean;
  order: number;
  width?: number;
  height?: number;
  format?: string;
}

export interface IProduct {
  _id?: Types.ObjectId;
  name: string;
  category?: Types.ObjectId;
  productGroup?: Types.ObjectId;
  brand?: string;
  modelNumber?: string;
  model?: string;
  color?: string;
  condition: ProductCondition;
  sku: string;
  barcode: string;
  serialTracking: boolean;
  costPrice: number;
  sellingPrice: number;
  minSellingPrice: number;
  images: ProductImage[] | string[]; // Support both new structure and legacy string array
  description?: string;
  active: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProductDocument = Document & IProduct;

const ProductSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Product Name is required"],
      trim: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
    },
    productGroup: {
      type: Schema.Types.ObjectId,
      ref: "ProductGroup",
    },
    brand: {
      type: String,
      trim: true,
      default: "",
    },
    modelNumber: {
      type: String,
      trim: true,
      default: "",
    },
    model: {
      type: String,
      trim: true,
      default: "",
    },
    color: {
      type: String,
      trim: true,
      default: "Unspecified",
    },
    condition: {
      type: String,
      enum: PRODUCT_CONDITIONS,
      required: [true, "Product condition (New/Used) is required"],
      default: DEFAULT_PRODUCT_CONDITION,
    },
    sku: {
      type: String,
      required: [true, "SKU is required"],
      trim: true,
      uppercase: true,
    },
    barcode: {
      type: String,
      required: [true, "Barcode is required"],
      trim: true,
    },
    serialTracking: {
      type: Boolean,
      default: false,
    },
    costPrice: {
      type: Number,
      required: [true, "Cost Price is required"],
      min: [0, "Cost Price must be greater than or equal to 0"],
    },
    sellingPrice: {
      type: Number,
      required: [true, "Selling Price is required"],
      min: [0, "Selling Price must be greater than or equal to 0"],
    },
    minSellingPrice: {
      type: Number,
      required: [true, "Minimum Selling Price is required"],
      min: [0, "Minimum Selling Price must be greater than or equal to 0"],
    },
    images: {
      type: [{
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        isPrimary: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
        width: { type: Number },
        height: { type: Number },
        format: { type: String },
      }],
      default: [],
    },
    description: {
      type: String,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to ensure model and modelNumber are synced and color has default
ProductSchema.pre("save", function (this: any) {
  const self = this as any;
  if (self.modelNumber && !self.model) {
    self.model = self.modelNumber;
  } else if (self.model && !self.modelNumber) {
    self.modelNumber = self.model;
  }
  if (!self.color) {
    self.color = "Unspecified";
  }
  if (self.brand === undefined || self.brand === null) {
    self.brand = "";
  }
});

// Index SKU for uniqueness among non-deleted items
ProductSchema.index({ sku: 1 }, { unique: true });

// Index Barcode for uniqueness among non-deleted items
ProductSchema.index(
  { barcode: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);

// Index for identity duplicate checks & variant queries
ProductSchema.index({ brand: 1, modelNumber: 1, color: 1, condition: 1, isDeleted: 1 });

// Index text search fields
ProductSchema.index({ name: "text", sku: "text", barcode: "text", model: "text", modelNumber: "text", brand: "text", color: "text" });

// Filter by condition in product directory
ProductSchema.index({ condition: 1, isDeleted: 1 });

export const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>("Product", ProductSchema);

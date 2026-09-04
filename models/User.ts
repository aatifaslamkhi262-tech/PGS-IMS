import mongoose, { Schema, Document, Model } from "mongoose";

export type UserRole = "Admin" | "Warehouse" | "Accountant" | "Branch" | "Salesman";

export interface IUser {
  username: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserDocument = Document & IUser;

const UserSchema: Schema = new Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
    },
    role: {
      type: String,
      enum: ["Admin", "Warehouse", "Accountant", "Branch", "Salesman"],
      required: [true, "User role is required"],
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



export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

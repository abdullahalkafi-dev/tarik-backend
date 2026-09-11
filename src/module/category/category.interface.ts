import { Types } from "mongoose";

export interface TCategory {
  _id: Types.ObjectId;
  name: string;
  icon?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

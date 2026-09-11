import { Types } from "mongoose";

export interface TReview {
  _id: Types.ObjectId;
  job: Types.ObjectId;
  reviewer: Types.ObjectId;
  reviewee: Types.ObjectId;
  rating: number; // 1 to 5
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

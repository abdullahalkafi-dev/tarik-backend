import { Types } from "mongoose";

export interface TReview {
  _id: Types.ObjectId;
  job: Types.ObjectId;
  reviewer: Types.ObjectId;
  reviewee: Types.ObjectId;
  rating: number; // 1 to 5
  comment?: string;
  editedAt?: Date;
  /** The reviewed person's public answer (one reply, no edits). */
  reply?: { text: string; at: Date };
  reportedAt?: Date;
  reportedBy?: Types.ObjectId;
  reportReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

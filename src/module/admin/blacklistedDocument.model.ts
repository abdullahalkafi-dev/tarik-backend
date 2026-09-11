import { Schema, model, Types } from "mongoose";

export interface TBlacklistedDocument {
  _id: Types.ObjectId;
  documentHash: string;
  documentType?: string;
  maskedDocumentNumber?: string;
  reason?: string;
  blacklistedBy?: Types.ObjectId;
  originalUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const blacklistedDocumentSchema = new Schema<TBlacklistedDocument>(
  {
    documentHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    documentType: {
      type: String,
    },
    maskedDocumentNumber: {
      type: String,
    },
    reason: {
      type: String,
      default: "Flagged identity / fraud prevention",
    },
    blacklistedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    originalUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

export const BlacklistedDocument = model<TBlacklistedDocument>(
  "BlacklistedDocument",
  blacklistedDocumentSchema,
);

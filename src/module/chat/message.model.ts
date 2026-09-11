import { Schema, model } from "mongoose";
import {
  TMessage,
  MessageType,
  OfferStatus,
  PriceType,
  PaymentMethod,
} from "./chat.interface";

const offerDataSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    price: { type: Number, required: true, min: 0 },
    priceType: {
      type: String,
      enum: Object.values(PriceType),
      default: PriceType.FIXED,
    },
    date: { type: String, trim: true },
    startTime: { type: String, trim: true },
    endTime: { type: String, trim: true },
    address: { type: String, trim: true, maxlength: 500 },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.CASH,
    },
    images: [{ type: String }],
    status: {
      type: String,
      enum: Object.values(OfferStatus),
      default: OfferStatus.PENDING,
    },
    acceptedJobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      default: null,
    },
  },
  { _id: false },
);

const readBySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const messageSchema = new Schema<TMessage>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(MessageType),
      required: true,
    },
    content: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    images: [{ type: String }],
    video: { type: String },
    offerData: { type: offerDataSchema },
    readBy: [readBySchema],
  },
  { timestamps: true },
);

// Index: messages for a conversation, sorted by time
messageSchema.index({ conversation: 1, createdAt: -1 });
// Index: find unread messages for a user in a conversation
messageSchema.index({ conversation: 1, "readBy.userId": 1 });

export const Message = model<TMessage>("Message", messageSchema);

import { Schema, model } from "mongoose";
import { TConversation } from "./chat.interface";

const conversationSchema = new Schema<TConversation>(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true },
);

// Index: find conversations for a user, sorted by most recent
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export const Conversation = model<TConversation>(
  "Conversation",
  conversationSchema,
);

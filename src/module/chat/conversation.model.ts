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
    participantsKey: { type: String },
    blockedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

// Index: find conversations for a user, sorted by most recent
conversationSchema.index({ participants: 1, lastMessageAt: -1 });
// One conversation per pair (race-proof). Documents created before this field
// existed are backfilled at start-up (see backfillConversationKeys).
conversationSchema.index(
  { participantsKey: 1 },
  { unique: true, partialFilterExpression: { participantsKey: { $type: "string" } } },
);

export const conversationKey = (ids: string[]) => [...ids.map(String)].sort().join("_");

export const Conversation = model<TConversation>(
  "Conversation",
  conversationSchema,
);

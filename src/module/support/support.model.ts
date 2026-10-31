import { Schema, model } from "mongoose";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TicketStatus,
  TSupportMessage,
  TSupportTicket,
} from "./support.interface";

const supportMessageSchema = new Schema<TSupportMessage>(
  {
    ticket: { type: Schema.Types.ObjectId, ref: "SupportTicket", required: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["user", "helper", "admin"], required: true },
    // Optional: image-only messages send content:""
    content: { type: String, default: "" },
    attachments: [{ type: String }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const supportTicketSchema = new Schema<TSupportTicket>(
  {
    ticketId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userRole: { type: String, enum: ["user", "helper"], default: "user" },
    subject: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(TicketStatus),
      default: TicketStatus.OPEN,
    },
    category: { type: String, enum: TICKET_CATEGORIES, default: "other" },
    priority: { type: String, enum: TICKET_PRIORITIES, default: "normal" },
    job: { type: Schema.Types.ObjectId, ref: "Job" },
    reportedUser: { type: Schema.Types.ObjectId, ref: "User" },
    assignee: { type: Schema.Types.ObjectId, ref: "User" },
    internalNotes: [
      {
        _id: false,
        by: { type: Schema.Types.ObjectId, ref: "User", required: true },
        byName: { type: String },
        text: { type: String, required: true, maxlength: 2000 },
        at: { type: Date, default: Date.now },
      },
    ],
    adminReadBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    resolvedAt: { type: Date },
    lastMessage: { type: String },
    unreadByAdmin: { type: Boolean, default: true },
    unreadByUser: { type: Boolean, default: false },
  },
  { timestamps: true }
);

supportTicketSchema.index({ user: 1 });
supportTicketSchema.index({ status: 1, updatedAt: -1 });
supportTicketSchema.index({ job: 1 });
supportTicketSchema.index({ category: 1, priority: 1 });
supportMessageSchema.index({ ticket: 1 });

export const SupportTicket = model<TSupportTicket>("SupportTicket", supportTicketSchema);
export const SupportMessage = model<TSupportMessage>("SupportMessage", supportMessageSchema);

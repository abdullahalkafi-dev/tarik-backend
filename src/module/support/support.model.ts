import { Schema, model } from "mongoose";
import { TicketStatus, TSupportMessage, TSupportTicket } from "./support.interface";

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
    lastMessage: { type: String },
    unreadByAdmin: { type: Boolean, default: true },
    unreadByUser: { type: Boolean, default: false },
  },
  { timestamps: true }
);

supportTicketSchema.index({ user: 1 });
supportTicketSchema.index({ status: 1 });
supportMessageSchema.index({ ticket: 1 });

export const SupportTicket = model<TSupportTicket>("SupportTicket", supportTicketSchema);
export const SupportMessage = model<TSupportMessage>("SupportMessage", supportMessageSchema);

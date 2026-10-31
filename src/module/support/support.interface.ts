import { Types } from "mongoose";

export enum TicketStatus {
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  RESOLVED = "resolved",
}

export interface TSupportMessage {
  _id?: Types.ObjectId;
  ticket: Types.ObjectId;
  sender: Types.ObjectId;
  senderRole: "user" | "helper" | "admin";
  content: string;
  attachments?: string[];
  createdAt: Date;
}

export const TICKET_CATEGORIES = [
  "payment",
  "safety",
  "kyc",
  "job",
  "account",
  "app",
  "other",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface TSupportTicket {
  _id: Types.ObjectId;
  ticketId: string;
  user: Types.ObjectId;
  userRole: "user" | "helper";
  subject: string;
  status: TicketStatus;
  category?: TicketCategory;
  priority?: TicketPriority;
  /** Job this ticket is about (disputes, no-shows…). */
  job?: Types.ObjectId;
  /** Person the ticket reports (safety / harassment). */
  reportedUser?: Types.ObjectId;
  assignee?: Types.ObjectId;
  /** Staff-only remarks, never shown to the customer. */
  internalNotes?: { by: Types.ObjectId; byName?: string; text: string; at: Date }[];
  /** Staff who already looked at the latest customer message (per-agent "unread"). */
  adminReadBy?: Types.ObjectId[];
  resolvedAt?: Date;
  lastMessage?: string;
  unreadByAdmin: boolean;
  unreadByUser: boolean;
  createdAt: Date;
  updatedAt: Date;
}

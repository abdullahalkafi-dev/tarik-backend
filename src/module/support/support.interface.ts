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

export interface TSupportTicket {
  _id: Types.ObjectId;
  ticketId: string;
  user: Types.ObjectId;
  userRole: "user" | "helper";
  subject: string;
  status: TicketStatus;
  lastMessage?: string;
  unreadByAdmin: boolean;
  unreadByUser: boolean;
  createdAt: Date;
  updatedAt: Date;
}

import { Types } from "mongoose";

// ─── Enums ─────────────────────────────────────────────
export enum MessageType {
  TEXT = "text",
  IMAGE = "image",
  VIDEO = "video",
  OFFER = "offer",
}

export enum OfferStatus {
  PENDING = "pending",
  /** Online accept claimed a checkout session; not yet paid. */
  AWAITING_PAYMENT = "awaiting_payment",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
}

export enum PriceType {
  FIXED = "fixed",
  HOURLY = "hourly",
}

export enum PaymentMethod {
  CASH = "cash",
  ONLINE = "online",
}

// ─── Sub-types ─────────────────────────────────────────
export interface TOfferData {
  title: string;
  description: string;
  price: number;
  priceType: PriceType;
  date?: string;
  startTime: string;
  endTime: string;
  address?: string;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
  paymentMethod: PaymentMethod;
  images: string[];
  status: OfferStatus;
  acceptedJobId?: Types.ObjectId;
}

export interface TReadBy {
  userId: Types.ObjectId;
  readAt: Date;
}

// ─── Conversation ──────────────────────────────────────
export interface TConversation {
  _id: Types.ObjectId;
  participants: Types.ObjectId[];
  lastMessage?: Types.ObjectId;
  lastMessageAt: Date;
  unreadCounts: Map<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Message ───────────────────────────────────────────
export interface TMessage {
  _id: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  type: MessageType;
  content?: string;
  images: string[];
  video?: string;
  offerData?: TOfferData;
  readBy: TReadBy[];
  createdAt: Date;
}

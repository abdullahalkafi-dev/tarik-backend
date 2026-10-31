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
  /** Nobody answered in time; the helper's prepaid commission was returned. */
  EXPIRED = "expired",
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
  commissionDeducted?: number;
  /** Bumped on every edit: the client must accept the exact version they saw. */
  version: number;
  /** TOTAL in MAD (hourly: rate × hours), computed by the server. */
  totalAmount?: number;
  hourlyRate?: number;
  hours?: number;
  /** Commission % in force when the offer was sent / last edited. */
  feePercentage?: number;
  helperNet?: number;
  expiresAt?: Date;
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
  /** Sorted participant ids joined by "_" — one conversation per pair. */
  participantsKey?: string;
  /** Users who blocked this conversation (nobody can write while it is non-empty). */
  blockedBy?: Types.ObjectId[];
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
  /** True when phone numbers / links were hidden because no job links the two people yet. */
  masked?: boolean;
  readBy: TReadBy[];
  createdAt: Date;
}

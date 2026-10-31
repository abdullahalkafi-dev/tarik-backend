import { SupportMessage, SupportTicket } from "./support.model";
import { TicketStatus, TSupportTicket } from "./support.interface";

const USER_FIELDS = "name email avatar role isHelperFormSubmitted helperApplicationStatus auth";

export const SupportRepository = {
  createTicket(payload: Partial<TSupportTicket>) {
    return SupportTicket.create(payload);
  },

  findTicketById(id: string) {
    return SupportTicket.findById(id)
      .populate("user", USER_FIELDS)
      .populate("job", "title status budget paymentMethod postedBy assignedTo")
      .populate("reportedUser", "name avatar")
      .populate("assignee", "name avatar");
  },

  findTicketsByUser(userId: string) {
    return SupportTicket.find({ user: userId })
      .select("-internalNotes -adminReadBy")
      .populate("user", USER_FIELDS)
      .sort({ updatedAt: -1 })
      .limit(100);
  },

  async findAllTickets(filter: object = {}, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate("user", USER_FIELDS)
        .populate("assignee", "name avatar")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      SupportTicket.countDocuments(filter).exec(),
    ]);

    return {
      docs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  updateTicketStatus(ticketId: string, status: TicketStatus) {
    return SupportTicket.findByIdAndUpdate(
      ticketId,
      {
        $set: { status },
        ...(status === TicketStatus.RESOLVED
          ? { resolvedAt: new Date() }
          : { $unset: { resolvedAt: 1 } }),
      } as any,
      { returnDocument: "after" },
    );
  },

  updateFields(ticketId: string, fields: Record<string, unknown>) {
    return SupportTicket.findByIdAndUpdate(ticketId, { $set: fields }, { returnDocument: "after", runValidators: true });
  },

  addNote(ticketId: string, note: { by: string; byName?: string; text: string }) {
    return SupportTicket.findByIdAndUpdate(
      ticketId,
      { $push: { internalNotes: { ...note, at: new Date() } } },
      { returnDocument: "after" },
    );
  },

  createMessage(payload: any) {
    return SupportMessage.create(payload);
  },

  findMessagesByTicket(ticketId: string) {
    return SupportMessage.find({ ticket: ticketId })
      .populate("sender", "name avatar role")
      .sort({ createdAt: 1 });
  },

  /** A new message arrived: flip the unread markers for the other side. */
  updateLastMessage(ticketId: string, lastMessage: string, isFromAdmin: boolean, adminId?: string) {
    return SupportTicket.findByIdAndUpdate(ticketId, {
      $set: {
        lastMessage,
        // A customer message is unread for every agent; an agent's reply leaves only the
        // other agents "unread" (they may want to see what was answered).
        unreadByAdmin: !isFromAdmin,
        unreadByUser: isFromAdmin,
        adminReadBy: isFromAdmin && adminId ? [adminId] : [],
      },
    });
  },

  /** Owner opened the ticket. */
  clearUserUnread(ticketId: string) {
    return SupportTicket.findByIdAndUpdate(ticketId, { $set: { unreadByUser: false } }, { returnDocument: "after" });
  },

  /** An agent opened the ticket: it is read for THEM (not for the other agents). */
  markReadByAdmin(ticketId: string, adminId: string) {
    return SupportTicket.findByIdAndUpdate(ticketId, { $addToSet: { adminReadBy: adminId } }, { returnDocument: "after" });
  },
};

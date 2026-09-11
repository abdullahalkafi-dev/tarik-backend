import { SupportMessage, SupportTicket } from "./support.model";
import { TicketStatus, TSupportTicket } from "./support.interface";

export const SupportRepository = {
  createTicket(payload: Partial<TSupportTicket>) {
    return SupportTicket.create(payload);
  },

  findTicketById(id: string) {
    return SupportTicket.findById(id).populate(
      "user",
      "name email avatar role isHelperFormSubmitted helperApplicationStatus auth",
    );
  },

  findTicketsByUser(userId: string) {
    return SupportTicket.find({ user: userId })
      .populate(
        "user",
        "name email avatar role isHelperFormSubmitted helperApplicationStatus auth",
      )
      .sort({ updatedAt: -1 });
  },

  async findAllTickets(filter: object = {}, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate(
          "user",
          "name email avatar role isHelperFormSubmitted helperApplicationStatus auth",
        )
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
    return SupportTicket.findByIdAndUpdate(ticketId, { status }, { new: true });
  },

  createMessage(payload: any) {
    return SupportMessage.create(payload);
  },

  findMessagesByTicket(ticketId: string) {
    return SupportMessage.find({ ticket: ticketId })
      .populate("sender", "name avatar role")
      .sort({ createdAt: 1 });
  },

  updateLastMessage(ticketId: string, lastMessage: string, isFromAdmin: boolean) {
    return SupportTicket.findByIdAndUpdate(ticketId, {
      lastMessage,
      unreadByAdmin: !isFromAdmin,
      unreadByUser: isFromAdmin,
    });
  },

  /** Clear unread flags when a ticket is opened (admin or owner). */
  updateUnreadFlags(
    ticketId: string,
    flags: { unreadByAdmin?: boolean; unreadByUser?: boolean },
  ) {
    return SupportTicket.findByIdAndUpdate(ticketId, { $set: flags }, { new: true });
  },
};

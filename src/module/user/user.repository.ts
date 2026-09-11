import { TUser } from "./user.interface";
import { User } from "./user.model";

type QueryOptions = {
  select?: Record<string, 0 | 1> | string;
  sort?: Record<string, 1 | -1> | string;
  limit?: number;
  skip?: number;
  populate?: string | string[];
};

type FindOneOptions = Pick<QueryOptions, "select" | "populate">;

export const UserRepository = {
  create(payload: Partial<TUser>) {
    return User.create(payload);
  },

  findById(id: string, options: FindOneOptions = {}) {
    let query = User.findById(id);
    if (options.select) query = query.select(options.select);
    if (options.populate) {
      const populates = Array.isArray(options.populate)
        ? options.populate
        : [options.populate];
      populates.forEach((p) => {
        query = query.populate(p);
      });
    }
    return query;
  },

  findOne(filter: object, options: FindOneOptions = {}) {
    let query = User.findOne(filter);
    if (options.select) query = query.select(options.select);
    if (options.populate) {
      const populates = Array.isArray(options.populate)
        ? options.populate
        : [options.populate];
      populates.forEach((p) => {
        query = query.populate(p);
      });
    }
    return query;
  },

  findMany(filter: object = {}, options: QueryOptions = {}) {
    let query = User.find(filter);
    if (options.select) query = query.select(options.select);
    if (options.sort) query = query.sort(options.sort);
    if (typeof options.skip === "number") query = query.skip(options.skip);
    if (typeof options.limit === "number") query = query.limit(options.limit);
    if (options.populate) {
      const populates = Array.isArray(options.populate)
        ? options.populate
        : [options.populate];
      populates.forEach((p) => {
        query = query.populate(p);
      });
    }
    return query;
  },

  updateById(id: string, payload: object) {
    return User.findByIdAndUpdate(id, payload, {
      returnDocument: "after",
      runValidators: true,
    });
  },

  /** Prevents the same FCM token from remaining on another account (shared device / account switch). */
  clearDeviceTokenFromOthers(userId: string, token: string) {
    return User.updateMany(
      { deviceToken: token, _id: { $ne: userId } },
      { $unset: { deviceToken: 1, deviceTokenPlatform: 1, deviceTokenUpdatedAt: 1 } },
    );
  },

  /** Remove a dead/expired FCM token wherever it is stored. */
  clearDeviceTokenByValue(token: string) {
    return User.updateMany(
      { deviceToken: token },
      { $unset: { deviceToken: 1, deviceTokenPlatform: 1, deviceTokenUpdatedAt: 1 } },
    );
  },

  deleteById(id: string) {
    return User.findByIdAndDelete(id);
  },

  deleteMany(filter: object) {
    return User.deleteMany(filter);
  },

  async exists(filter: object) {
    const doc = await User.exists(filter);
    return Boolean(doc);
  },

  count(filter: object = {}) {
    return User.countDocuments(filter);
  },
};

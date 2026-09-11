import { TCategory } from "./category.interface";
import { Category } from "./category.model";

type QueryOptions = {
  select?: Record<string, 0 | 1> | string;
  sort?: Record<string, 1 | -1> | string;
  limit?: number;
  skip?: number;
};

type FindOneOptions = Pick<QueryOptions, "select">;

export const CategoryRepository = {
  create(payload: Partial<TCategory>) {
    return Category.create(payload);
  },

  findById(id: string, options: FindOneOptions = {}) {
    let query = Category.findById(id);
    if (options.select) query = query.select(options.select);
    return query;
  },

  findOne(filter: object, options: FindOneOptions = {}) {
    let query = Category.findOne(filter);
    if (options.select) query = query.select(options.select);
    return query;
  },

  findMany(filter: object = {}, options: QueryOptions = {}) {
    let query = Category.find(filter);
    if (options.select) query = query.select(options.select);
    if (options.sort) query = query.sort(options.sort);
    if (typeof options.skip === "number") query = query.skip(options.skip);
    if (typeof options.limit === "number") query = query.limit(options.limit);
    return query;
  },

  updateById(id: string, payload: object) {
    return Category.findByIdAndUpdate(id, payload, {
      returnDocument: "after",
      runValidators: true,
    });
  },

  deleteById(id: string) {
    return Category.findByIdAndDelete(id);
  },

  async exists(filter: object) {
    const doc = await Category.exists(filter);
    return Boolean(doc);
  },

  count(filter: object = {}) {
    return Category.countDocuments(filter);
  },
};

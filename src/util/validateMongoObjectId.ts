import { Types } from "mongoose";

export const isValidMongoObjectId = (id: string): boolean => {
  return Types.ObjectId.isValid(id);
};

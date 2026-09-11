import mongoose from "mongoose";

jest.mock("module/user/user.repository", () => ({
  UserRepository: {
    findById: jest.fn(),
    updateById: jest.fn(),
  },
}));

jest.mock("module/auth/auth.repository", () => ({
  AuthRepository: {
    findById: jest.fn(),
  },
}));

jest.mock("redis/cacheService", () => ({
  __esModule: true,
  default: {
    deleteCache: jest.fn(),
  },
}));

jest.mock("redis/cache.utils", () => ({
  buildCacheKey: jest.fn().mockReturnValue("test:cache:key"),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { UserRepository } = require("module/user/user.repository") as {
  UserRepository: {
    findById: jest.Mock;
    updateById: jest.Mock;
  };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthRepository } = require("module/auth/auth.repository") as {
  AuthRepository: {
    findById: jest.Mock;
  };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cacheService = require("redis/cacheService").default as {
  deleteCache: jest.Mock;
};

import { UserService } from "module/user/user.service";
import { HelperApplicationStatus } from "module/user/user.interface";

describe("UserService", () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const authId = new mongoose.Types.ObjectId().toString();

  describe("getMe", () => {
    it("should return user with auth info", async () => {
      const mockUser = {
        _id: userId,
        auth: authId,
        name: "Test User",
        email: "test@test.com",
        phone: "1234567890",
        avatar: "avatar.jpg",
        coverPhoto: "cover.jpg",
        bio: "Test bio",
        location: { type: "Point" as const, coordinates: [-7.5898, 33.5731] },
        address: "Casablanca",
        isHelperFormSubmitted: false,
        helperApplicationStatus: null,
        rejectionReason: undefined,
        age: undefined,
        city: undefined,
        language: undefined,
        serviceType: undefined,
        pricePerHour: undefined,
        experience: undefined,
        serviceRadius: undefined,
        profilePhotos: undefined,
        documentType: undefined,
        documentUrl: undefined,
        selfieUrl: undefined,
      };

      const mockAuth = { _id: authId, role: "user", status: "active" };

      UserRepository.findById.mockResolvedValue(mockUser);
      AuthRepository.findById.mockResolvedValue(mockAuth);

      const result = await UserService.getMe(userId);

      expect(result).toEqual(
        expect.objectContaining({
          _id: userId,
          name: "Test User",
          email: "test@test.com",
          role: "user",
          status: "active",
        }),
      );
      expect(UserRepository.findById).toHaveBeenCalledWith(userId, {
        populate: "serviceType",
      });
      expect(AuthRepository.findById).toHaveBeenCalledWith(authId);
    });

    it("should throw 404 if user not found", async () => {
      UserRepository.findById.mockResolvedValue(null);

      await expect(UserService.getMe(userId)).rejects.toMatchObject({
        statusCode: 404,
        message: "User not found",
      });
    });

    it("should throw 404 if auth not found", async () => {
      UserRepository.findById.mockResolvedValue({
        _id: userId,
        auth: authId,
        name: "Test",
      });
      AuthRepository.findById.mockResolvedValue(null);

      await expect(UserService.getMe(userId)).rejects.toMatchObject({
        statusCode: 404,
        message: "Account not found",
      });
    });
  });

  describe("updateProfile", () => {
    it("should update and return user", async () => {
      const payload = { name: "Updated Name", bio: "New bio" };
      const updatedUser = { _id: userId, ...payload };

      UserRepository.updateById.mockResolvedValue(updatedUser);
      cacheService.deleteCache.mockResolvedValue(true);

      const result = await UserService.updateProfile(userId, payload);

      expect(result).toEqual(updatedUser);
      expect(UserRepository.updateById).toHaveBeenCalledWith(userId, payload);
      expect(cacheService.deleteCache).toHaveBeenCalledWith("test:cache:key");
    });

    it("should throw 404 if user not found", async () => {
      UserRepository.updateById.mockResolvedValue(null);

      await expect(
        UserService.updateProfile(userId, { name: "Test" }),
      ).rejects.toMatchObject({ statusCode: 404, message: "User not found" });
    });
  });

  describe("updateLocation", () => {
    it("should update location successfully", async () => {
      const payload = {
        longitude: -7.5898,
        latitude: 33.5731,
        address: "Casablanca, Morocco",
      };
      const updatedUser = {
        _id: userId,
        location: { type: "Point", coordinates: [-7.5898, 33.5731] },
        address: "Casablanca, Morocco",
      };

      UserRepository.updateById.mockResolvedValue(updatedUser);

      const result = await UserService.updateLocation(userId, payload);

      expect(result).toEqual(updatedUser);
      expect(UserRepository.updateById).toHaveBeenCalledWith(userId, {
        location: { type: "Point", coordinates: [-7.5898, 33.5731] },
        address: "Casablanca, Morocco",
      });
    });

    it("should throw 404 if user not found", async () => {
      UserRepository.updateById.mockResolvedValue(null);

      await expect(
        UserService.updateLocation(userId, { longitude: 0, latitude: 0 }),
      ).rejects.toMatchObject({ statusCode: 404, message: "User not found" });
    });
  });

  describe("helperApply", () => {
    const applyPayload = {
      age: 25,
      city: "Casablanca",
      language: "Arabic",
      serviceType: new mongoose.Types.ObjectId().toString(),
      pricePerHour: 100,
      experience: 3,
      serviceRadius: 20,
      profilePhotos: ["photo1.jpg"],
      documentType: "nid" as const,
      documentUrl: "doc-url.jpg",
      selfieUrl: "selfie.jpg",
      phone: "1234567890",
    };

    it("should submit application successfully", async () => {
      const mockUser = {
        _id: userId,
        helperApplicationStatus: null,
        location: { type: "Point", coordinates: [-7.5898, 33.5731] },
      };

      UserRepository.findById.mockResolvedValue(mockUser);
      UserRepository.updateById.mockResolvedValue({
        ...mockUser,
        ...applyPayload,
        isHelperFormSubmitted: true,
        helperApplicationStatus: HelperApplicationStatus.PENDING,
      });

      const result = await UserService.helperApply(userId, applyPayload);

      expect(result).toEqual(
        expect.objectContaining({
          isHelperFormSubmitted: true,
          helperApplicationStatus: HelperApplicationStatus.PENDING,
        }),
      );
    });

    it("should throw 404 if user not found", async () => {
      UserRepository.findById.mockResolvedValue(null);

      await expect(
        UserService.helperApply(userId, applyPayload),
      ).rejects.toMatchObject({ statusCode: 404, message: "User not found" });
    });

    it("should throw 400 if application already approved", async () => {
      UserRepository.findById.mockResolvedValue({
        _id: userId,
        helperApplicationStatus: HelperApplicationStatus.APPROVED,
        location: { type: "Point", coordinates: [-7.5898, 33.5731] },
      });

      await expect(
        UserService.helperApply(userId, applyPayload),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Application already approved",
      });
    });

    it("should throw 400 if application already pending", async () => {
      UserRepository.findById.mockResolvedValue({
        _id: userId,
        helperApplicationStatus: HelperApplicationStatus.PENDING,
        location: { type: "Point", coordinates: [-7.5898, 33.5731] },
      });

      await expect(
        UserService.helperApply(userId, applyPayload),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Application already pending",
      });
    });

    it("should throw 400 if no location set", async () => {
      UserRepository.findById.mockResolvedValue({
        _id: userId,
        helperApplicationStatus: null,
        location: null,
      });

      await expect(
        UserService.helperApply(userId, applyPayload),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Please set your location first",
      });
    });

    it("should throw 400 if location has no coordinates", async () => {
      UserRepository.findById.mockResolvedValue({
        _id: userId,
        helperApplicationStatus: null,
        location: { type: "Point" as const, coordinates: undefined },
      });

      await expect(
        UserService.helperApply(userId, applyPayload),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Please set your location first",
      });
    });
  });

  describe("getApplicationStatus", () => {
    it("should return application status", async () => {
      UserRepository.findById.mockResolvedValue({
        _id: userId,
        isHelperFormSubmitted: true,
        helperApplicationStatus: HelperApplicationStatus.PENDING,
        rejectionReason: undefined,
      });

      const result = await UserService.getApplicationStatus(userId);

      expect(result).toEqual({
        isHelperFormSubmitted: true,
        helperApplicationStatus: HelperApplicationStatus.PENDING,
        rejectionReason: undefined,
      });
      expect(UserRepository.findById).toHaveBeenCalledWith(userId, {
        select:
          "isHelperFormSubmitted helperApplicationStatus rejectionReason name email",
      });
    });

    it("should throw 404 if user not found", async () => {
      UserRepository.findById.mockResolvedValue(null);

      await expect(
        UserService.getApplicationStatus(userId),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "User not found",
      });
    });
  });
});

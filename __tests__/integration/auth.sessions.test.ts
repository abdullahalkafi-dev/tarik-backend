/** In-memory stand-in for Redis so lock-outs and OTP limits can be tested. */
jest.mock("../../src/redis/redisClient", () => {
  const store = new Map<string, { v: string; exp: number }>();
  const live = (k: string) => {
    const e = store.get(k);
    if (!e) return null;
    if (e.exp < Date.now()) {
      store.delete(k);
      return null;
    }
    return e;
  };
  const fake = {
    isAvailable: () => true,
    getLastError: () => null,
    get: async (k: string) => live(k)?.v ?? null,
    set: async (k: string, v: string, ttl = 3600) => {
      store.set(k, { v, exp: Date.now() + ttl * 1000 });
    },
    setNX: async (k: string, v: string, ttl = 60) => {
      if (live(k)) return false;
      store.set(k, { v, exp: Date.now() + ttl * 1000 });
      return true;
    },
    delete: async (k: string) => {
      store.delete(k);
    },
    incrWithWindow: async (k: string, ttl: number) => {
      const e = live(k);
      const n = (e ? Number(e.v) : 0) + 1;
      store.set(k, { v: String(n), exp: e ? e.exp : Date.now() + ttl * 1000 });
      return n;
    },
    client: {},
    __reset: () => store.clear(),
  };
  return { __esModule: true, default: fake };
});
jest.mock("../../src/socket/socket.gateway", () => ({
  disconnectUserSockets: jest.fn(),
  emitToUser: jest.fn(),
  getSocketServer: jest.fn().mockReturnValue(null),
}));

import redisClient from "../../src/redis/redisClient";
import { AuthService } from "../../src/module/auth/auth.service";
import { Auth } from "../../src/module/auth/auth.model";
import { Session } from "../../src/module/auth/session.model";
import { User } from "../../src/module/user/user.model";
import authMiddleware from "../../src/middlewares/auth";
import { requirePermission, requireStaffPermission } from "../../src/middlewares/auth";
import createJwtToken from "../../src/jwt/createJwtToken";
import config from "../../src/config";
import { createClient } from "../helpers/factory";

const PHONE = "0612345678";
const PASSWORD = "Secret#123";

const register = async (phone = PHONE) => {
  await AuthService.registerWithPhone({ phone, password: PASSWORD, name: "Test Person", role: "user" });
  return AuthService.verifyPhoneOtp(phone, "123456");
};

/** Runs the real HTTP auth middleware against a bearer token. */
const authorize = async (token: string, ...roles: string[]) => {
  const req: any = { headers: { authorization: `Bearer ${token}` } };
  let error: any;
  await authMiddleware(...roles)(req, {} as any, (e?: any) => {
    error = e;
  });
  return { req, error };
};

beforeAll(async () => {
  await Promise.all([Auth.init(), User.init(), Session.init()]);
});

beforeEach(() => {
  (redisClient as any).__reset();
});

describe("sign-up and login", () => {
  it("registers, verifies with the demo code and receives a session", async () => {
    const res: any = await register();
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect(res.user.role).toBe("user");
    expect(await Session.countDocuments({})).toBe(1);
  });

  it("refuses passwords shorter than 8 characters (AU-12)", async () => {
    await expect(
      AuthService.registerWithPhone({ phone: PHONE, password: "short1", name: "Test", role: "user" }),
    ).rejects.toMatchObject({ code: "PASSWORD_TOO_SHORT" });
  });

  it("logs in with the right password only; the message never reveals whether the account exists", async () => {
    await register();
    const ok: any = await AuthService.loginWithPhone({ phone: PHONE, password: PASSWORD });
    expect(ok.accessToken).toBeTruthy();

    const wrong = await AuthService.loginWithPhone({ phone: PHONE, password: "nope-nope" }).catch((e) => e);
    const unknown = await AuthService.loginWithPhone({ phone: "0699999999", password: "whatever1" }).catch((e) => e);
    expect(wrong.message).toBe(unknown.message);
    expect(wrong.statusCode).toBe(401);
  });

  it("locks an account after 5 wrong passwords (DS-03)", async () => {
    await register();
    for (let i = 0; i < 5; i++) {
      await AuthService.loginWithPhone({ phone: PHONE, password: `wrong-pass-${i}` }).catch(() => undefined);
    }
    await expect(AuthService.loginWithPhone({ phone: PHONE, password: PASSWORD })).rejects.toMatchObject({
      statusCode: 429,
      code: "LOGIN_LOCKED",
    });
  });

  it("the OTP request limit applies to unknown numbers too, so existence cannot be probed (AU-09)", async () => {
    const results: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await AuthService.forgotPasswordPhone("0688888888").then(
        () => 200,
        (e) => e.statusCode,
      );
      results.push(r);
    }
    expect(results).toContain(429);
  });
});

describe("the API reads role and status from the database, not from the token (AU-08)", () => {
  it("accepts a fresh token", async () => {
    const res: any = await register();
    const { error, req } = await authorize(res.accessToken);
    expect(error).toBeUndefined();
    expect(req.user.role).toBe("user");
    expect(req.user.permissions).toEqual([]);
  });

  it("a role change applies immediately, with the same token", async () => {
    const res: any = await register();
    await Auth.updateOne({ phone: "+212612345678" }, { $set: { role: "helper" } });
    const { req, error } = await authorize(res.accessToken, "helper");
    expect(error).toBeUndefined();
    expect(req.user.role).toBe("helper");
  });

  it("demoting a helper closes helper endpoints at once", async () => {
    const res: any = await register();
    await Auth.updateOne({ phone: "+212612345678" }, { $set: { role: "helper" } });
    await Auth.updateOne({ phone: "+212612345678" }, { $set: { role: "user" } });
    const { error } = await authorize(res.accessToken, "helper");
    expect(error).toMatchObject({ statusCode: 403 });
  });

  it("a client token is never staff, even if the token claims so", async () => {
    const res: any = await register();
    const auth = await Auth.findOne({ phone: "+212612345678" });
    const user = await User.findOne({ auth: auth!._id });
    const forged = createJwtToken(
      { userId: String(user!._id), authId: String(auth!._id), role: "superAdmin", isSuperAdmin: true, permissions: ["*"], tv: 0 },
      config.jwt.jwt_secret as string,
      "1h",
    );
    const { error } = await authorize(forged, "superAdmin");
    expect(error).toMatchObject({ statusCode: 403 });
    void res;
  });

  it("suspended, blacklisted and deleted accounts lose access immediately", async () => {
    for (const patch of [{ status: "suspended" }, { isBlacklisted: true }, { isDeleted: true }]) {
      (redisClient as any).__reset();
      await Auth.deleteMany({});
      await User.deleteMany({});
      const res: any = await register();
      await Auth.updateOne({ phone: "+212612345678" }, { $set: patch });
      const { error } = await authorize(res.accessToken);
      expect(error).toMatchObject({ statusCode: 401 });
    }
  });

  it("a password-reset token is not a session token", async () => {
    await register();
    const auth = await Auth.findOne({ phone: "+212612345678" });
    const resetToken = createJwtToken(
      { authId: String(auth!._id), type: "password_reset", tv: 0 },
      config.jwt.jwt_secret as string,
      "10m",
    );
    const { error } = await authorize(resetToken);
    expect(error).toMatchObject({ statusCode: 401 });
  });
});

describe("sessions, logout and password changes", () => {
  it("refresh issues a new pair; after logout the refresh token is dead", async () => {
    const res: any = await register();
    const refreshed: any = await AuthService.getAccessToken(res.refreshToken);
    expect(refreshed.accessToken).toBeTruthy();
    expect(refreshed.refreshToken).toBeTruthy();

    const { req } = await authorize(res.accessToken);
    await AuthService.logout(req.user.sessionId);
    await expect(AuthService.getAccessToken(res.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("a password reset ends every old session and works only once (AU-03/AU-08)", async () => {
    const res: any = await register();
    await AuthService.forgotPasswordPhone(PHONE);
    const { resetToken } = await AuthService.verifyResetOtpPhone(PHONE, "123456");

    await AuthService.resetPasswordPhone(resetToken, "BrandNew#456");
    await expect(AuthService.resetPasswordPhone(resetToken, "AnotherOne#789")).rejects.toMatchObject({
      code: "RESET_TOKEN_USED",
    });

    expect((await authorize(res.accessToken)).error).toMatchObject({ statusCode: 401 });
    await expect(AuthService.getAccessToken(res.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    await expect(AuthService.loginWithPhone({ phone: PHONE, password: PASSWORD })).rejects.toMatchObject({ statusCode: 401 });
    const fresh: any = await AuthService.loginWithPhone({ phone: PHONE, password: "BrandNew#456" });
    expect(fresh.accessToken).toBeTruthy();
  });

  it("changing the password keeps this device logged in and logs the others out", async () => {
    const first: any = await register();
    const second: any = await AuthService.loginWithPhone({ phone: PHONE, password: PASSWORD });
    const { req } = await authorize(first.accessToken);

    await expect(
      AuthService.changePassword(String(req.user.auth._id), String(req.user._id), "wrong-current", "NewSecret#1"),
    ).rejects.toMatchObject({ code: "WRONG_CURRENT_PASSWORD" });

    const changed: any = await AuthService.changePassword(
      String(req.user.auth._id),
      String(req.user._id),
      PASSWORD,
      "NewSecret#1",
    );
    expect((await authorize(changed.accessToken)).error).toBeUndefined();
    expect((await authorize(first.accessToken)).error).toMatchObject({ statusCode: 401 });
    expect((await authorize(second.accessToken)).error).toMatchObject({ statusCode: 401 });
  });

  it("logout-all revokes every device", async () => {
    const a: any = await register();
    const b: any = await AuthService.loginWithPhone({ phone: PHONE, password: PASSWORD });
    const { req } = await authorize(a.accessToken);
    await AuthService.logoutAll(String(req.user.auth._id));
    expect((await authorize(a.accessToken)).error).toMatchObject({ statusCode: 401 });
    expect((await authorize(b.accessToken)).error).toMatchObject({ statusCode: 401 });
  });
});

describe("e-mail login is for staff only (AU-01 / AU-05)", () => {
  it("a customer with an e-mail cannot log in through it", async () => {
    const client = await createClient();
    await Auth.updateOne({ _id: client.auth._id }, { $set: { email: "client@example.com", isEmailVerified: true } });
    await expect(AuthService.login({ email: "client@example.com", password: "Password1!" })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("a staff account can, and is told when it must choose a new password", async () => {
    const auth = await (Auth as any).create({
      email: "staff@example.com",
      password: "Temp#Pass1",
      role: "staff",
      loginProvider: "email",
      status: "active",
      isEmailVerified: true,
      permissions: ["support.manage"],
      mustChangePassword: true,
    });
    await (User as any).create({ auth: auth._id, name: "Staff", email: "staff@example.com" });
    const res: any = await AuthService.login({ email: "Staff@Example.com", password: "Temp#Pass1" });
    expect(res.user.role).toBe("staff");
    expect(res.user.mustChangePassword).toBe(true);
    expect(res.user.permissions).toEqual(["support.manage"]);
  });

  it("with the temporary password a staff member can only change it, read their profile or sign out", async () => {
    const auth = await (Auth as any).create({
      email: "newstaff@example.com",
      password: "Temp#Pass1",
      role: "staff",
      loginProvider: "email",
      status: "active",
      isEmailVerified: true,
      permissions: ["support.manage"],
      mustChangePassword: true,
    });
    await (User as any).create({ auth: auth._id, name: "New Staff", email: "newstaff@example.com" });
    const login: any = await AuthService.login({ email: "newstaff@example.com", password: "Temp#Pass1" });

    const call = async (url: string) => {
      const req: any = { headers: { authorization: `Bearer ${login.accessToken}` }, originalUrl: url };
      let error: any;
      await authMiddleware("staff")(req, {} as any, (e?: any) => {
        error = e;
      });
      return error;
    };
    expect(await call("/api/v1/support/tickets/admin/all?page=1")).toMatchObject({
      statusCode: 403,
      code: "PASSWORD_CHANGE_REQUIRED",
    });
    expect(await call("/api/v1/auth/change-password")).toBeUndefined();
    expect(await call("/api/v1/admin/me")).toBeUndefined();

    // once the password is changed the restriction is gone
    await Auth.updateOne({ _id: auth._id }, { $set: { mustChangePassword: false } });
    expect(await call("/api/v1/support/tickets/admin/all")).toBeUndefined();
  });
});

describe("permissions middleware (AD-01)", () => {
  const run = (user: any, ...perms: string[]) => {
    let error: any;
    requirePermission(...perms)({ user } as any, {} as any, (e?: any) => {
      error = e;
    });
    return error;
  };

  it("passes holders, wildcard and super admin; blocks the rest", () => {
    expect(run({ permissions: ["settings.manage"] }, "settings.manage")).toBeUndefined();
    expect(run({ permissions: ["*"] }, "settings.manage")).toBeUndefined();
    expect(run({ isSuperAdmin: true, permissions: [] }, "settings.manage")).toBeUndefined();
    expect(run({ permissions: ["support.manage"] }, "settings.manage")).toMatchObject({ statusCode: 403 });
    expect(run({ permissions: [] }, "settings.manage")).toMatchObject({ statusCode: 403 });
  });

  it("requireStaffPermission lets customers through but checks staff", () => {
    let e1: any;
    requireStaffPermission("jobs.manage")({ user: { role: "user", permissions: [] } } as any, {} as any, (e?: any) => {
      e1 = e;
    });
    expect(e1).toBeUndefined();
    let e2: any;
    requireStaffPermission("jobs.manage")({ user: { role: "staff", permissions: ["support.manage"] } } as any, {} as any, (e?: any) => {
      e2 = e;
    });
    expect(e2).toMatchObject({ statusCode: 403 });
  });
});

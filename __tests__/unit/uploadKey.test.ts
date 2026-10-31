import {
  assertOwnUploadKey,
  isPrivateKey,
  parseUploadKey,
  signFileKey,
  toStorageKey,
  verifyFileSignature,
} from "../../src/util/uploadKey";

const OWNER = "507f1f77bcf86cd799439011";
const OTHER = "507f1f77bcf86cd799439012";

describe("toStorageKey", () => {
  it("accepts keys and our own file URLs", () => {
    expect(toStorageKey(`images/${OWNER}/a.webp`)).toBe(`images/${OWNER}/a.webp`);
    expect(toStorageKey(`https://api.example.com/api/v1/upload/files/images/${OWNER}/a.webp?x=1`)).toBe(
      `images/${OWNER}/a.webp`,
    );
  });
});

describe("assertOwnUploadKey (CH-08 / SP-05)", () => {
  it("accepts the owner's file", () => {
    expect(assertOwnUploadKey(`images/${OWNER}/a.webp`, OWNER)).toBe(`images/${OWNER}/a.webp`);
  });
  it("rejects somebody else's file", () => {
    expect(() => assertOwnUploadKey(`images/${OTHER}/a.webp`, OWNER)).toThrow(/only use files you uploaded/);
  });
  it("rejects external URLs and path tricks", () => {
    expect(() => assertOwnUploadKey("https://evil.example/pixel.png", OWNER)).toThrow(/Invalid file reference/);
    expect(() => assertOwnUploadKey(`images/${OWNER}/../${OTHER}/a.webp`, OWNER)).toThrow();
    expect(() => assertOwnUploadKey("javascript:alert(1)", OWNER)).toThrow();
  });
  it("rejects the wrong kind of file", () => {
    expect(() => assertOwnUploadKey(`videos/${OWNER}/a.mp4`, OWNER, { kinds: ["images"] })).toThrow(/not allowed here/);
  });
  it("keeps values the record already stores (legacy)", () => {
    expect(assertOwnUploadKey("legacy-file.svg", OWNER, { allowed: ["legacy-file.svg"] })).toBe("legacy-file.svg");
  });
  it("staff may reference any user's file", () => {
    expect(assertOwnUploadKey(`images/${OTHER}/a.webp`, OWNER, { isStaff: true })).toBe(`images/${OTHER}/a.webp`);
  });
});

describe("private files and signed links (UP-03)", () => {
  it("documents are private, images are not", () => {
    expect(isPrivateKey(`documents/${OWNER}/id.webp`)).toBe(true);
    expect(isPrivateKey(`images/${OWNER}/a.webp`)).toBe(false);
    expect(parseUploadKey(`documents/${OWNER}/id.webp`)).toEqual({ kind: "documents", owner: OWNER });
  });
  it("a valid signature opens the file, a changed key or expiry does not", () => {
    const key = `documents/${OWNER}/id.webp`;
    const { exp, sig } = signFileKey(key, 60);
    expect(verifyFileSignature(key, exp, sig)).toBe(true);
    expect(verifyFileSignature(`documents/${OTHER}/id.webp`, exp, sig)).toBe(false);
    expect(verifyFileSignature(key, exp + 1, sig)).toBe(false);
    expect(verifyFileSignature(key, exp, "0".repeat(40))).toBe(false);
    const expired = signFileKey(key, -10);
    expect(verifyFileSignature(key, expired.exp, expired.sig)).toBe(false);
  });
});

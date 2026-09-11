import crypto from "crypto";

interface OTPOptions {
  length?: number;
  alphanumeric?: boolean;
}

const generateOTP = (options: OTPOptions = {}): string => {
  const { length = 4, alphanumeric = false } = options;

  if (alphanumeric) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let otp = "";
    for (let i = 0; i < length; i++) {
      otp += chars[crypto.randomInt(0, chars.length)];
    }
    return otp;
  }

  const max = Math.pow(10, length);

  // Dev mode: hardcoded OTP for easy testing
  if (process.env.NODE_ENV === "development") {
    return "1234";
  }

  const otp = crypto.randomInt(0, max);
  return otp.toString().padStart(length, "0");
};

export default generateOTP;

export type TCreateAccount = {
  name: string;
  email: string | undefined;
  otp: string;
};

export type TResetPassword = {
  email: string | undefined;
  otp: string;
  name: string;
  expiresIn?: number;
};

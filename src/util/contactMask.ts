/**
 * Before a job links two people, phone numbers, e-mail addresses and links are
 * hidden in chat. This keeps the booking (and the platform commission) inside
 * the app and protects both sides from being pulled onto other channels.
 */
const PHONE_RE = /(?:\+|00)?\d[\d\s().\-]{7,}\d/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_RE = /\b(?:https?:\/\/|www\.|wa\.me\/|t\.me\/)\S+/gi;
const SPELLED_DIGITS_RE = /(?:\b(?:zero|one|two|three|four|five|six|seven|eight|nine|صفر|واحد|اثنين|ثلاثة|أربعة|خمسة|ستة|سبعة|ثمانية|تسعة)\b[\s,.-]*){7,}/gi;

const MASK = "••••";

export const maskContactInfo = (text: string): { text: string; masked: boolean } => {
  let masked = false;
  const replace = (re: RegExp) => {
    text = text.replace(re, () => {
      masked = true;
      return MASK;
    });
  };
  replace(URL_RE);
  replace(EMAIL_RE);
  replace(PHONE_RE);
  replace(SPELLED_DIGITS_RE);
  return { text, masked };
};

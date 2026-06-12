import { randomBytes } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(bytes) {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");

  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += alphabet[Number.parseInt(chunk, 2)];
  }
  return output;
}

const issuer = process.env.TOTP_ISSUER || "TarsoArt";
const account = process.env.TOTP_ACCOUNT || "admin";
const secret = base32(randomBytes(20));
const label = encodeURIComponent(`${issuer}:${account}`);
const query = new URLSearchParams({
  secret,
  issuer,
  algorithm: "SHA1",
  digits: "6",
  period: "30",
});

console.log(`ADMIN_TOTP_SECRET=${secret}`);
console.log(`otpauth://totp/${label}?${query.toString()}`);

import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rl = createInterface({ input, output });
const password = await rl.question("Admin password: ");
rl.close();

const hash = createHash("sha256").update(password).digest("hex");
console.log(hash);

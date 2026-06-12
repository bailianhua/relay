import { config } from "dotenv";
import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

const commandFiles = readdirSync(resolve(__dirname, "commands")).filter(
  (f) => (f.endsWith(".ts") || f.endsWith(".js")) && f !== "loader.ts"
);

const body: unknown[] = [];
for (const file of commandFiles) {
  const mod = await import(resolve(__dirname, "commands", file));
  const cmd = mod.default ?? mod;
  if ("data" in cmd) body.push(cmd.data.toJSON());
}

await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), { body });
console.log(`Registered ${body.length} application command(s).`);

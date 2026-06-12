import { Collection } from "discord.js";
import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { Command } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadCommands(commands: Collection<string, Command>) {
  const files = readdirSync(__dirname).filter(
    (f) => (f.endsWith(".js") || f.endsWith(".ts")) && !f.endsWith(".d.ts") && f !== "loader.ts" && f !== "loader.js"
  );
  for (const file of files) {
    const mod = await import(resolve(__dirname, file));
    const command: Command = mod.default ?? mod;
    if ("data" in command && "execute" in command) {
      commands.set(command.data.name, command);
    }
  }
}

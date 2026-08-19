const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const commands = [];

const commandsPath = path.join(__dirname, "commands");

for (const file of fs.readdirSync(commandsPath)) {
    if (!file.endsWith(".js")) continue;

    const command = require(path.join(commandsPath, file));
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" })
    .setToken(process.env.DISCORD_TOKEN);

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

(async () => {
    try {
        // Registra no servidor de desenvolvimento
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            {
                body: commands
            }
        );

        // Remove comandos globais antigos
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: []
            }
        );

        console.log("✅ Comandos do servidor registrados.");
        console.log("🗑️ Comandos globais removidos.");
    } catch (error) {
        console.error(error);
    }
})();
const {Client,GatewayIntentBits,Collection} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { discordToken } = require("./config");
const youtubeService = require("./services/youtube");
const client = new Client({intents: [GatewayIntentBits.Guilds]});
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");

for (const file of fs.readdirSync(commandsPath)) {
    if (!file.endsWith(".js")) continue;
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
}

const eventsPath = path.join(__dirname, "events");

for (const file of fs.readdirSync(eventsPath)) {
    if (!file.endsWith(".js")) continue;
    const event = require(path.join(eventsPath, file));
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

client.once("ready", () => {
    console.log(`Logado como ${client.user.tag}`);
    youtubeService.start(client);
});

client.login(discordToken);
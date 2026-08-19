const {ChannelSelectMenuBuilder,ActionRowBuilder,ChannelType,MessageFlags} = require("discord.js");
const fs = require("fs");
const path = require("path");

function extractYouTubeChannelId(url) {
    url = url.trim().replace(/\/+$/, "");

    const patterns = [
        { regex: /youtube\.com\/channel\/([^\/]+)/, index: 1 },
        { regex: /youtube\.com\/c\/([^\/]+)/, index: 1 },
        { regex: /youtube\.com\/@([^\/]+)/, index: 1 },
        { regex: /youtube\.com\/user\/([^\/]+)/, index: 1 },
        { regex: /^([UC][A-Z0-9_-]{22})$/, index: 1 }
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern.regex);
        if (match) {
            if (pattern.index === 1 && match[1].startsWith('UC')) return match[1];
            return match[1];
        }
    }

    return url;
}

const databasePath = path.join(__dirname,"../storage/guilds.json");

function loadDatabase() {
    return JSON.parse(fs.readFileSync(databasePath, "utf8"));
}

function saveDatabase(data) {
    fs.writeFileSync(databasePath,JSON.stringify(data, null, 4));
}

module.exports = {
    name: "interactionCreate",
    async execute(interaction) {

        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                if (!interaction.replied) {
                    await interaction.reply({
                        content: "Ocorreu um erro.",
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId !== "setup_youtube") return;
            const youtubeUrl = interaction.fields.getTextInputValue("youtube_url");
            const channelSelect = new ChannelSelectMenuBuilder()
                                                                .setCustomId(`setup_channel:${youtubeUrl}`)
                                                                .setPlaceholder("Selecione o canal de notificações")
                                                                .setChannelTypes(ChannelType.GuildText)
                                                                .setMinValues(1)
                                                                .setMaxValues(1);

            const row = new ActionRowBuilder().addComponents(channelSelect);

            await interaction.reply({
                content: "Agora selecione o canal onde devo enviar as notificações:",
                components: [row],
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        if (interaction.isChannelSelectMenu()) {
            if (!interaction.customId.startsWith("setup_channel:")) return;
            const youtubeUrl = interaction.customId.substring("setup_channel:".length);
            const discordChannelId = interaction.values[0];
            const database = loadDatabase();
            database[interaction.guildId] = {youtubeChannelUrl: youtubeUrl,discordChannel: discordChannelId,lastVideoId: null};
            saveDatabase(database);
            await interaction.update({
                content:
                    "✅ Configuração concluída!\n\n" +
                    `📺 YouTube: ${youtubeUrl}\n` +
                    `💬 Canal: <#${discordChannelId}>`,
                components: []
            });
        }
    }
};
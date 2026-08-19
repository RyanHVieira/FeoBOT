const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Configura as notificações do YouTube."),

    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId("setup_youtube")
            .setTitle("Configurar YouTube");

        const youtubeInput = new TextInputBuilder()
            .setCustomId("youtube_url")
            .setLabel("URL do canal do YouTube")
            .setPlaceholder("https://www.youtube.com/@canal")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const row = new ActionRowBuilder()
            .addComponents(youtubeInput);

        modal.addComponents(row);

        await interaction.showModal(modal);
    }
};
require("dotenv").config();

module.exports = {
    discordToken: process.env.DISCORD_TOKEN,
    youtubeCheckInterval: 60 * 1000
};
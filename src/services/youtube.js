const axios = require("axios");
const fs = require("fs");
const path = require("path");

const databasePath = path.join(
    __dirname,
    "../storage/guilds.json"
);

const API_KEY = process.env.YOUTUBE_API_KEY;

function loadDatabase() {
    if (!fs.existsSync(databasePath)) {
        fs.writeFileSync(databasePath, "{}");
        return {};
    }

    const content = fs.readFileSync(databasePath, "utf8").trim();

    if (!content) {
        return {};
    }

    return JSON.parse(content);
}

function saveDatabase(data) {
    fs.writeFileSync(
        databasePath,
        JSON.stringify(data, null, 4)
    );
}


/*
 * Descobre a playlist de uploads do canal.
 *
 * channels.list custa apenas 1 unidade.
 */
async function getUploadsPlaylistId(channelId) {

    const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/channels",
        {
            params: {
                key: API_KEY,
                id: channelId,
                part: "contentDetails"
            }
        }
    );

    const channel = response.data.items?.[0];

    if (!channel) {
        throw new Error(
            "Canal do YouTube não encontrado."
        );
    }

    return channel.contentDetails.relatedPlaylists.uploads;
}


/*
 * Busca os últimos vídeos da playlist de uploads.
 *
 * playlistItems.list custa apenas 1 unidade.
 *
 * Shorts também aparecem aqui.
 */
async function getLatestVideos(playlistId) {

    const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/playlistItems",
        {
            params: {
                key: API_KEY,
                playlistId: playlistId,
                part: "snippet,contentDetails",
                maxResults: 10
            }
        }
    );

    return response.data.items || [];
}


/*
 * Verifica um servidor.
 */
async function checkGuild(
    client,
    guildId,
    config,
    database
) {

    try {

        if (!config.youtubeChannelId) {

            console.log(
                `❌ Nenhum Channel ID configurado para ${guildId}`
            );

            return;
        }


        /*
         * Descobre a playlist de uploads uma única vez.
         */
        if (!config.youtubeUploadsPlaylistId) {

            config.youtubeUploadsPlaylistId =
                await getUploadsPlaylistId(
                    config.youtubeChannelId
                );

            saveDatabase(database);

            console.log(
                `📂 Playlist de uploads encontrada: ${config.youtubeUploadsPlaylistId}`
            );
        }


        /*
         * Busca os últimos vídeos.
         */
        const videos =
            await getLatestVideos(
                config.youtubeUploadsPlaylistId
            );


        if (!videos.length) {

            console.log(
                `Nenhum vídeo encontrado para ${guildId}`
            );

            return;
        }


        /*
         * Pega o ID do vídeo mais recente.
         */
        const latestVideoId =
            videos[0].contentDetails.videoId;


        /*
         * Primeira execução.
         *
         * Salva o vídeo atual sem notificar.
         */
        if (!config.lastVideoId) {

            config.lastVideoId =
                latestVideoId;

            saveDatabase(database);

            console.log(
                `📌 Vídeo inicial salvo: ${videos[0].snippet.title}`
            );

            return;
        }


        /*
         * Procura vídeos publicados depois
         * do último vídeo conhecido.
         */
        const newVideos = [];

        for (const video of videos) {

            const videoId =
                video.contentDetails.videoId;

            if (
                videoId ===
                config.lastVideoId
            ) {
                break;
            }

            newVideos.push(video);
        }


        /*
         * Nenhum vídeo novo.
         */
        if (!newVideos.length) {
            return;
        }


        /*
         * Atualiza o último vídeo conhecido.
         */
        config.lastVideoId =
            latestVideoId;

        saveDatabase(database);


        /*
         * Busca o canal do Discord.
         */
        const discordChannel =
            await client.channels.fetch(
                config.discordChannel
            );


        if (!discordChannel) {

            console.log(
                `❌ Canal Discord não encontrado: ${config.discordChannel}`
            );

            return;
        }


        /*
         * Envia os vídeos do mais antigo
         * para o mais recente.
         */
        for (
            const video
            of newVideos.reverse()
        ) {

            const videoId =
                video.contentDetails.videoId;

            const title =
                video.snippet.title;

            const url =
                `https://www.youtube.com/watch?v=${videoId}`;


            await discordChannel.send(
                `🎬 **Novo vídeo no YouTube!**\n\n` +
                `**${title}**\n` +
                `${url}`
            );


            console.log(
                `📢 Novo vídeo enviado: ${title}`
            );
        }

    } catch (error) {

        console.error(
            `❌ Erro verificando YouTube (${guildId}):`,
            error.response?.data ||
            error.message
        );
    }
}


/*
 * Verifica todos os servidores configurados.
 */
async function checkAll(client) {

    const database = loadDatabase();

    for (
        const [guildId, config]
        of Object.entries(database)
    ) {

        await checkGuild(
            client,
            guildId,
            config,
            database
        );
    }

    saveDatabase(database);
}


/*
 * Inicia o serviço.
 */
function start(client) {

    console.log(
        "Serviço do YouTube iniciado."
    );


    if (!API_KEY) {

        console.error(
            "❌ YOUTUBE_API_KEY não encontrada no .env"
        );

        return;
    }


    checkAll(client);


    setInterval(
        () => checkAll(client),
        60 * 1000
    );
}


module.exports = {
    start
};
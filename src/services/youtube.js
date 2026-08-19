const axios = require("axios");
const fs = require("fs");
const path = require("path");

const databasePath = path.join(
    __dirname,
    "../storage/guilds.json"
);

const API_KEY = process.env.YOUTUBE_API_KEY;


/**
 * Resolve um URL ou nome de usuário do YouTube para um Channel ID
 * Suporta diversos formatos: @username, /c/customName, /user/username, ou ID direto
 */
async function resolveYouTubeChannelId(identifier) {
    // Remove trailing slash if present
    identifier = identifier.trim().replace(/\/+$/, "");

    // Se já é um ID de canal direto (começa com UC e tem 24 caracteres)
    if (/^UC[A-Z0-9_-]{22}$/.test(identifier)) {
        return identifier;
    }

    try {
        // Tentar diferentes abordagens para resolver o ID do canal

        // 1. Tentar como @handle (para URLs como youtube.com/@username)
        if (identifier.includes('@') || identifier.startsWith('@')) {
            const handle = identifier.startsWith('@') ? identifier.substring(1) : identifier.split('/').pop();
            const response = await axios.get(
                "https://www.googleapis.com/youtube/v3/channels",
                {
                    params: {
                        key: API_KEY,
                        forHandle: `@${handle}`,
                        part: "id"
                    }
                }
            );

            if (response.data.items && response.data.items.length > 0) {
                return response.data.items[0].id;
            }
        }

        // 2. Tentar buscar por nome de usuário (para /user/ ou nome simples)
        // Primeiro, extrair o possível nome de usuário
        let username = identifier;
        if (identifier.includes('/')) {
            const parts = identifier.split('/');
            // Pegar a última parte que não estiver vazia
            for (let i = parts.length - 1; i >= 0; i--) {
                if (parts[i]) {
                    username = parts[i];
                    break;
                }
            }
        }

        // Remover prefixos conhecidos
        username = username.replace(/^@/, '').replace(/^c\//, '').replace(/^user\//, '');

        if (username) {
            const response = await axios.get(
                "https://www.googleapis.com/youtube/v3/channels",
                {
                    params: {
                        key: API_KEY,
                        forHandle: `@${username}`, // Tentar como handle primeiro
                        part: "id"
                    }
                }
            );

            if (response.data.items && response.data.items.length > 0) {
                return response.data.items[0].id;
            }

            // Se não encontrou como handle, tentar como username
            const response2 = await axios.get(
                "https://www.googleapis.com/youtube/v3/channels",
                {
                    params: {
                        key: API_KEY,
                        forUsername: username,
                        part: "id"
                    }
                }
            );
        }
    } catch (error) {
        console.error(`Erro ao resolver canal do YouTube ${identifier}:`, error.message);
    }

    // Se não conseguiu resolver, retornar o identificador original (vai falhar depois)
    return identifier;
}

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
        // Resolver o YouTube Channel ID se necessário
        let youtubeChannelId = config.youtubeChannelId;

        // Validar se o ID armazenado parece ser um ID de canal do YouTube válido
        const isValidYoutubeId = youtubeChannelId && /^UC[A-Z0-9_-]{22}$/.test(youtubeChannelId);

        // Se não temos um ID válido mas temos a URL salva, resolver
        if (!isValidYoutubeId && config.youtubeChannelUrl) {
            console.log(
                `🔍 Resolvendo URL do YouTube para ${guildId}: ${config.youtubeChannelUrl}`
            );
            youtubeChannelId = await resolveYouTubeChannelId(config.youtubeChannelUrl);

            // Salvar o ID resolvido para uso futuro
            config.youtubeChannelId = youtubeChannelId;
            saveDatabase(database);

            console.log(
                `✅ Canal do YouTube resolvido: ${youtubeChannelId}`
            );
        }

        if (!youtubeChannelId) {

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
                    youtubeChannelId
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
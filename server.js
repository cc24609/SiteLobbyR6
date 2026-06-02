const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uri = process.env.MONGO_URI;

// PROTEÇÃO INTERNA: Mostra se o Render realmente está enviando a variável
if (!uri) {
    console.error("❌ ERRO CRÍTICO: A variável de ambiente MONGO_URI está vazia ou indefinida no Render!");
}

const client = new MongoClient(uri || "mongodb://localhost:27017/teste");
let db, dbPlayers, dbMatches, dbConfig;

async function conectarBanco() {
    try {
        if (!uri) return;
        await client.connect();
        db = client.db('lobbyR6'); 
        dbPlayers = db.collection('players');
        dbMatches = db.collection('matches');
        dbConfig = db.collection('config');
        console.log("🔥 Conectado com sucesso ao MongoDB Atlas (lobbyR6)!");
    } catch (err) {
        // Se o banco falhar, o log vai detalhar aqui o motivo real (senha, ssl, etc)
        console.error("❌ ERRO DETALHADO DE CONEXÃO COM O MONGO:", err);
    }
}
conectarBanco();

app.post('/login', (req, res) => {
    const { usuario, senha } = req.body;
    if (usuario === "adminR6" && senha === "adminR6") {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// --- SEU FRONT-END CHAMA ESSA ROTA LOGO AO ENTRAR NO SITE ---
app.get('/players', async (req, res) => {
    try {
        // Se as coleções não existirem ou o banco não conectou, vai disparar o Erro 500 aqui
        const players = await dbPlayers.find({}).toArray();
        res.json(players);
    } catch (e) { 
        console.error("❌ ERRO 500 NA ROTA /players:", e.message);
        res.status(500).json({ error: "Erro interno no servidor ao buscar jogadores.", detalhes: e.message }); 
    }
});

app.get('/matches', async (req, res) => {
    try {
        const matches = await dbMatches.find({}).toArray();
        res.json(matches);
    } catch (e) { 
        console.error("❌ ERRO 500 NA ROTA /matches:", e.message);
        res.status(500).json({ error: "Erro interno no servidor ao buscar partidas.", detalhes: e.message }); 
    }
});

app.get('/config', async (req, res) => {
    try {
        const config = await dbConfig.findOne({ tipo: 'lobby' });
        res.json(config || { nomeLobby: "Lobby R6" });
    } catch (e) { 
        console.error("❌ ERRO 500 NA ROTA /config:", e.message);
        res.status(500).json({ error: "Erro interno no servidor ao buscar config.", detalhes: e.message });
    }
});

// --- ROTAS DE JOGADORES (PLAYERS) ---
app.get('/players', async (req, res) => {
    try {
        const players = await dbPlayers.find({}).toArray();
        res.json(players);
    } catch (e) { res.json([]); }
});

app.post('/players', async (req, res) => {
    try {
        const novoPlayer = req.body;
        await dbPlayers.insertOne(novoPlayer);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/players/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await dbPlayers.deleteOne({ id: id });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ROTAS DE PARTIDAS (MATCHES) ---
app.get('/matches', async (req, res) => {
    try {
        const matches = await dbMatches.find({}).toArray();
        res.json(matches);
    } catch (e) { res.json([]); }
});

app.post('/matches', async (req, res) => {
    try {
        const novaPartida = req.body;
        await dbMatches.insertOne(novaPartida);

        // Atualiza as estatísticas acumuladas dos jogadores no banco de dados
        const atualizarStats = async (time, multiplicador) => {
            const statusVitoria = time.resultado === 'vitoria';
            for (const p of time.players) {
                await dbPlayers.updateOne(
                    { id: parseInt(p.id) },
                    {
                        $inc: {
                            kills: p.kills * multiplicador,
                            deaths: p.deaths * multiplicador,
                            wins: (statusVitoria ? 1 : 0) * multiplicador,
                            losses: (!statusVitoria ? 1 : 0) * multiplicador
                        }
                    }
                );
            }
        };

        await atualizarStats(novaPartida.timeAzul, 1);
        await atualizarStats(novaPartida.timeLaranja, 1);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/matches/:id', async (req, res) => {
    try {
        const matchId = parseInt(req.params.id);
        const partida = await dbMatches.findOne({ id: matchId });
        if (!partida) return res.status(404).json({ error: "Não encontrada" });

        const reverterStats = async (time) => {
            const statusVitoria = time.resultado === 'vitoria';
            for (const p of time.players) {
                await dbPlayers.updateOne(
                    { id: parseInt(p.id) },
                    {
                        $inc: {
                            kills: -p.kills,
                            deaths: -p.deaths,
                            wins: -(statusVitoria ? 1 : 0),
                            losses: -(!statusVitoria ? 1 : 0)
                        }
                    }
                );
            }
        };

        await reverterStats(partida.timeAzul);
        await reverterStats(partida.timeLaranja);
        await dbMatches.deleteOne({ id: matchId });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- CONFIGURAÇÃO DO LOBBY ---
app.get('/config', async (req, res) => {
    try {
        const config = await dbConfig.findOne({ tipo: 'lobby' });
        res.json(config || { nomeLobby: "Lobby R6" });
    } catch (e) { res.json({ nomeLobby: "Lobby R6" }); }
});

app.post('/config', async (req, res) => {
    try {
        const { nomeLobby } = req.body;
        await dbConfig.updateOne(
            { tipo: 'lobby' },
            { $set: { nomeLobby: nomeLobby } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// --- PING REQUISIÇÃO EXTERNA (KEEP-ALIVE) ---
const http = require('http');
setInterval(() => {
    if(process.env.RENDER_EXTERNAL_URL) {
        http.get(`${process.env.RENDER_EXTERNAL_URL}/config`, () => {});
    }
}, 840000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));
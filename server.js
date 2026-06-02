const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uri = process.env.MONGO_URI;

if (!uri) {
    console.error("❌ ERRO CRÍTICO: A variável MONGO_URI não foi encontrada no painel do Render!");
}

const client = new MongoClient(uri || "mongodb://localhost:27017/teste");
let db, dbPlayers, dbMatches, dbConfig;

// Função de conexão robusta
async function conectarBanco() {
    try {
        if (!uri) throw new Error("MONGO_URI ausente nas variáveis de ambiente.");
        
        await client.connect();
        db = client.db('lobbyR6'); 
        dbPlayers = db.collection('players');
        dbMatches = db.collection('matches');
        dbConfig = db.collection('config');
        console.log("🔥 Conectado com sucesso ao MongoDB Atlas (lobbyR6)!");
    } catch (err) {
        console.error("❌ ERRO CRÍTICO DE CONEXÃO COM O MONGO:", err.message);
    }
}
conectarBanco();

// Middleware de checagem: Se o banco não conectou, avisa o erro 500 detalhado
app.use((req, res, next) => {
    if (!dbPlayers || !dbMatches || !dbConfig) {
        return res.status(500).json({ 
            error: "O servidor iniciou, mas a conexão com o MongoDB Atlas ainda não foi estabelecida ou falhou." 
        });
    }
    next();
});

// --- ROTA DE LOGIN ---
app.post('/login', (req, res) => {
    const { usuario, senha } = req.body;
    if (usuario === "adminR6" && senha === "adminR6") {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// --- ROTAS DE JOGADORES (PLAYERS) ---
app.get('/players', async (req, res) => {
    try {
        const players = await dbPlayers.find({}).toArray();
        res.json(players);
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
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
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/matches', async (req, res) => {
    try {
        const novaPartida = req.body;
        await dbMatches.insertOne(novaPartida);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));
const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Puxa a string de conexão configurada no painel do Render
const uri = process.env.MONGO_URI;

if (!uri) {
    console.error("❌ ERRO CRÍTICO: A variável de ambiente MONGO_URI não foi definida no Render!");
}

const client = new MongoClient(uri || "mongodb://localhost:27017/lobbyr6");
let db, dbPlayers, dbMatches, dbConfig;

// Conexão assíncrona robusta com o MongoDB Atlas
async function conectarBanco() {
    try {
        if (!uri) return;
        await client.connect();
        db = client.db('lobbyr6'); 
        dbPlayers = db.collection('players');
        dbMatches = db.collection('matches');
        dbConfig = db.collection('config');
        console.log("🔥 Conectado com sucesso ao MongoDB Atlas (lobbyr6)!");
    } catch (err) {
        console.error("❌ ERRO CRÍTICO AO CONECTAR COM O MONGO:", err.message);
    }
}
conectarBanco();

// Middleware de Proteção: Se o banco ainda não ligou, impede o crash (Erro 500) e avisa
app.use((req, res, next) => {
    if (!dbPlayers || !dbMatches || !dbConfig) {
        return res.status(503).json({ 
            error: "O servidor está ativo, mas a conexão com o MongoDB Atlas ainda está a ser estabelecida. Aguarde alguns segundos e tente novamente." 
        });
    }
    next();
});

// --- ROTA DE LOGIN ADM ---
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
        console.error("Erro no GET /players:", e.message);
        res.json([]); 
    }
});

app.post('/players', async (req, res) => {
    try {
        const dadosPlayer = req.body;

        const novoPlayer = {
            id: Number(dadosPlayer.id) || Date.now(),
            nome: dadosPlayer.nome,
            kills: Number(dadosPlayer.kills) || 0,
            deaths: Number(dadosPlayer.deaths) || 0,
            wins: Number(dadosPlayer.wins) || 0,
            losses: Number(dadosPlayer.losses) || 0
        };

        await dbPlayers.insertOne(novoPlayer);
        console.log(`✅ Jogador [${novoPlayer.nome}] salvo com sucesso no MongoDB Atlas!`);
        res.json({ ok: true });
    } catch (e) { 
        console.error("❌ Erro no POST /players:", e.message);
        res.status(500).json({ error: "Erro ao salvar jogador", detalhes: e.message }); 
    }
});

app.delete('/players/:id', async (req, res) => {
    try {
        const idProcurado = Number(req.params.id);
        await dbPlayers.deleteOne({ id: idProcurado });
        console.log(`🗑️ Jogador com ID ${idProcurado} removido do banco.`);
        res.json({ ok: true });
    } catch (e) { 
        console.error("❌ Erro no DELETE /players:", e.message);
        res.status(500).json({ error: "Erro ao eliminar jogador", detalhes: e.message }); 
    }
});

// --- ROTAS DE PARTIDAS (MATCHES) ---
app.get('/matches', async (req, res) => {
    try {
        const matches = await dbMatches.find({}).toArray();
        res.json(matches);
    } catch (e) { 
        console.error("Erro no GET /matches:", e.message);
        res.json([]); 
    }
});

// Criar nova Partida (POST)
app.post('/matches', async (req, res) => {
    try {
        const novaPartida = req.body;
        
        novaPartida.id = Number(novaPartida.id) || Date.now();
        await dbMatches.insertOne(novaPartida);

        // Função interna para atualizar as estatísticas dos jogadores
        const ajustarStatsPlayers = async (time, multiplicador) => {
            const statusVitoria = time.resultado === 'vitoria';
            for (const p of time.players) {
                await dbPlayers.updateOne(
                    { id: Number(p.id) },
                    {
                        $inc: {
                            kills: Number(p.kills) * multiplicador,
                            deaths: Number(p.deaths) * multiplicador,
                            wins: (statusVitoria ? 1 : 0) * multiplicador,
                            losses: (!statusVitoria ? 1 : 0) * multiplicador
                        }
                    }
                );
            }
        };

        await ajustarStatsPlayers(novaPartida.timeAzul, 1);
        await ajustarStatsPlayers(novaPartida.timeLaranja, 1);

        console.log(`📊 Partida ID ${novaPartida.id} registrada e K/D recalculado!`);
        res.json({ ok: true });
    } catch (e) { 
        console.error("❌ Erro no POST /matches:", e.message);
        res.status(500).json({ error: "Erro ao registrar partida", detalhes: e.message }); 
    }
});

// 🔥 NOVA ROTA: Editar Partida Gravada (PUT) - Trata buscas por ID numérico ou String
app.put('/matches/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        const dadosNovos = req.body;

        // 1. Localiza a partida antiga antes de aplicar as mudanças (necessário para reverter K/D antigo)
        let partidaAntiga = await dbMatches.findOne({ id: Number(idParam) });
        let matchIdQuery = Number(idParam);

        if (!partidaAntiga) {
            partidaAntiga = await dbMatches.findOne({ id: String(idParam) });
            matchIdQuery = String(idParam);
        }

        if (!partidaAntiga) {
            return res.status(404).json({ error: "Partida não encontrada para edição." });
        }

        // 2. Função auxiliar para alterar o K/D de forma incremental
        const alterarStats = async (time, multiplicador) => {
            const statusVitoria = time.resultado === 'vitoria';
            for (const p of time.players) {
                await dbPlayers.updateOne(
                    { id: Number(p.id) },
                    {
                        $inc: {
                            kills: Number(p.kills) * multiplicador,
                            deaths: Number(p.deaths) * multiplicador,
                            wins: (statusVitoria ? 1 : 0) * multiplicador,
                            losses: (!statusVitoria ? 1 : 0) * multiplicador
                        }
                    }
                );
            }
        };

        // 3. REVERTE os status antigos calculados por essa partida anteriormente (multiplicador -1)
        if (partidaAntiga.timeAzul) await alterarStats(partidaAntiga.timeAzul, -1);
        if (partidaAntiga.timeLaranja) await alterarStats(partidaAntiga.timeLaranja, -1);

        // 4. Garante que o objeto atualizado mantém o ID correto e consistente
        dadosNovos.id = matchIdQuery;

        // 5. Substitui os dados da partida antiga pelos novos dados no MongoDB Atlas
        await dbMatches.replaceOne({ id: matchIdQuery }, dadosNovos);

        // 6. APLICA as novas pontuações higienizadas da partida atualizada (multiplicador 1)
        await alterarStats(dadosNovos.timeAzul, 1);
        await alterarStats(dadosNovos.timeLaranja, 1);

        console.log(`🔄 Partida ID ${idParam} ATUALIZADA e K/D recalculado com sucesso!`);
        res.json({ ok: true });

    } catch (e) {
        console.error("❌ Erro no PUT /matches:", e.message);
        res.status(500).json({ error: "Erro ao atualizar partida", detalhes: e.message });
    }
});

// Deletar Partida (DELETE) - Corrigido contra Erro 404 de tipo
app.delete('/matches/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        
        let partida = await dbMatches.findOne({ id: Number(idParam) });
        let matchIdQuery = Number(idParam);

        if (!partida) {
            partida = await dbMatches.findOne({ id: String(idParam) });
            matchIdQuery = String(idParam);
        }
        
        if (!partida) {
            console.warn(`⚠️ Partida ID ${idParam} não encontrada para exclusão.`);
            return res.status(404).json({ error: "Partida não encontrada no banco de dados." });
        }

        const reverterStatsPlayers = async (time) => {
            const statusVitoria = time.resultado === 'vitoria';
            for (const p of time.players) {
                await dbPlayers.updateOne(
                    { id: Number(p.id) },
                    {
                        $inc: {
                            kills: -Number(p.kills),
                            deaths: -Number(p.deaths),
                            wins: -(statusVitoria ? 1 : 0),
                            losses: -(!statusVitoria ? 1 : 0)
                        }
                    }
                );
            }
        };

        if (partida.timeAzul) await reverterStatsPlayers(partida.timeAzul);
        if (partida.timeLaranja) await reverterStatsPlayers(partida.timeLaranja);
        
        await dbMatches.deleteOne({ id: matchIdQuery });
        console.log(`🗑️ Partida ID ${idParam} eliminada e K/D revertido.`);
        res.json({ ok: true });
    } catch (e) { 
        console.error("❌ Erro no DELETE /matches:", e.message);
        res.status(500).json({ error: "Erro ao eliminar partida", detalhes: e.message }); 
    }
});

// --- CONFIGURAÇÃO DO LOBBY ---
app.get('/config', async (req, res) => {
    try {
        const config = await dbConfig.findOne({ tipo: 'lobby' });
        res.json(config || { nomeLobby: "Lobby R6" });
    } catch (e) { 
        res.json({ nomeLobby: "Lobby R6" }); 
    }
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
    } catch (e) { 
        res.json({ success: false }); 
    }
});

// --- PING KEEP-ALIVE (EVITA O SERVIDOR DORMIR FACILMENTE) ---
const http = require('http');
setInterval(() => {
    if (process.env.RENDER_EXTERNAL_URL) {
        http.get(`${process.env.RENDER_EXTERNAL_URL}/config`, () => {
            console.log("Keep-alive: Mantendo o motor aquecido.");
        });
    }
}, 840000); // 14 minutos

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));
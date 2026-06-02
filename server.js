const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dataDir = path.join(__dirname, 'data');

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    } catch (e) { return []; }
}
function writeJson(file, data) {
    fs.writeFileSync(path.join(dataDir, file), JSON.stringify(data, null, 2));
}

app.post('/login', (req, res) => {
    const { usuario, senha } = req.body;
    const [u, s] = fs.readFileSync(path.join(dataDir, 'admins.txt'), 'utf8').trim().split(':');
    res.json({ success: usuario === u && senha === s });
});

app.get('/players', (req, res) => res.json(readJson('players.json')));

app.post('/players', (req, res) => {
    const players = readJson('players.json');
    players.push(req.body); // { id, nome, kills, deaths, wins, losses }
    writeJson('players.json', players);
    res.json({ ok: true });
});

app.delete('/players/:id', (req, res) => {
    const id = parseInt(req.params.id);
    let players = readJson('players.json');
    players = players.filter(p => p.id !== id);
    writeJson('players.json', players);
    res.json({ ok: true });
});

app.get('/matches', (req, res) => res.json(readJson('matches.json')));

// Função auxiliar para processar estatísticas nos jogadores (sinal: 1 para somar, -1 para reverter)
function ajustarStatsPlayers(players, time, sinal) {
    time.players.forEach(pPartida => {
        if (!pPartida.id) return;
        const pGeral = players.find(p => p.id === parseInt(pPartida.id));
        if (pGeral) {
            pGeral.kills = Math.max(0, pGeral.kills + (parseInt(pPartida.kills || 0) * sinal));
            pGeral.deaths = Math.max(0, pGeral.deaths + (parseInt(pPartida.deaths || 0) * sinal));
            if (time.resultado === 'vitoria') {
                pGeral.wins = Math.max(0, pGeral.wins + (1 * sinal));
            } else {
                pGeral.losses = Math.max(0, pGeral.losses + (1 * sinal));
            }
        }
    });
}

// Salvar Nova Partida
app.post('/matches', (req, res) => {
    const { mapa, timeAzul, timeLaranja } = req.body;
    const matches = readJson('matches.json');
    const players = readJson('players.json');

    const novaPartida = { id: Date.now(), mapa, timeAzul, timeLaranja };

    ajustarStatsPlayers(players, timeAzul, 1);
    ajustarStatsPlayers(players, timeLaranja, 1);

    matches.push(novaPartida);
    writeJson('matches.json', matches);
    writeJson('players.json', players);
    res.json({ ok: true });
});

// Editar Partida Existente (Reverte os pontos antigos e aplica os novos)
app.put('/matches/:id', (req, res) => {
    const matchId = parseInt(req.params.id);
    const { mapa, timeAzul, timeLaranja } = req.body;
    let matches = readJson('matches.json');
    const players = readJson('players.json');

    const idx = matches.findIndex(m => m.id === matchId);
    if (idx === -1) return res.status(404).json({ error: "Não encontrada" });

    // 1. Reverte a pontuação antiga
    ajustarStatsPlayers(players, matches[idx].timeAzul, -1);
    ajustarStatsPlayers(players, matches[idx].timeLaranja, -1);

    // 2. Atualiza os dados e aplica a nova pontuação
    matches[idx] = { id: matchId, mapa, timeAzul, timeLaranja };
    ajustarStatsPlayers(players, timeAzul, 1);
    ajustarStatsPlayers(players, timeLaranja, 1);

    writeJson('matches.json', matches);
    writeJson('players.json', players);
    res.json({ ok: true });
});

// Deletar Partida
app.delete('/matches/:id', (req, res) => {
    const matchId = parseInt(req.params.id);
    let matches = readJson('matches.json');
    const players = readJson('players.json');

    const partida = matches.find(m => m.id === matchId);
    if (!partida) return res.status(404).json({ error: "Não encontrada" });

    ajustarStatsPlayers(players, partida.timeAzul, -1);
    ajustarStatsPlayers(players, partida.timeLaranja, -1);

    matches = matches.filter(m => m.id !== matchId);
    writeJson('matches.json', matches);
    writeJson('players.json', players);
    res.json({ ok: true });
});

// Rota pública para buscar as configurações atuais (como o nome do lobby)
app.get('/config', (req, res) => {
    const configPath = path.join(dataDir, 'config.json');
    if (fs.existsSync(configPath)) {
        res.json(JSON.parse(fs.readFileSync(configPath, 'utf8')));
    } else {
        res.json({ nomeLobby: "Lobby R6" });
    }
});

// Rota protegida para salvar o novo nome do lobby
app.post('/config', (req, res) => {
    const configPath = path.join(dataDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true, message: "Configuração atualizada!" });
});

app.listen(3000, () => console.log('Servidor em http://localhost:3000'));
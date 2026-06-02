let listaGlobalPlayers = [];
let listaGlobalMatches = [];

function switchTab(tabName) {
    document.querySelectorAll('.view-section').forEach(section => section.classList.remove('active'));
    document.querySelectorAll('.nav-tabs button').forEach(btn => btn.classList.remove('active'));
    
    const targetSection = document.getElementById(`tab-${tabName}`);
    const targetBtn = document.getElementById(`tab-${tabName}-btn`);
    
    if(targetSection) targetSection.classList.add('active');
    if(targetBtn) targetBtn.classList.add('active');
}

async function inicializarSistema() {
    await carregarConfiguracaoLobby();
    await carregarPlayers();
    await carregarPartidas();
    verificarEstadoAdmin();
    gerarOpcoesPlacar();
}

function obterClasseKD(kd) {
    if (kd > 1.3) return 'kd-high';
    if (kd < 0.7) return 'kd-low';
    return 'kd-normal';
}

async function carregarPlayers() {
    const res = await fetch('/players');
    listaGlobalPlayers = await res.json();
    
    const tbody = document.getElementById('rankingTableBody');
    
    // Se a tabela de classificação existir na tela atual, renderiza ela
    if (tbody) {
        tbody.innerHTML = "";
        
        const calcularKD = p => p.deaths === 0 ? p.kills : p.kills / p.deaths;
        const playersOrdenados = [...listaGlobalPlayers].sort((a,b) => calcularKD(b) - calcularKD(a));

        playersOrdenados.forEach((p, idx) => {
            const kd = calcularKD(p);
            tbody.innerHTML += `
                <tr>
                    <td><strong>#${idx + 1}</strong></td>
                    <td>${p.nome}</td>
                    <td class="${obterClasseKD(kd)}">${kd.toFixed(2)}</td>
                    <td>${p.kills}</td>
                    <td>${p.deaths}</td>
                    <td style="color:#2bff6a;">${p.wins}</td>
                    <td style="color:#ff3b3b;">${p.losses || 0}</td>
                </tr>
            `;
        });
    }

    // Se o painel de gerenciamento de players do ADM existir, renderiza ele
    const bodyAdm = document.getElementById('admListaPlayersCorpo');
    if (bodyAdm) {
        bodyAdm.innerHTML = "";
        listaGlobalPlayers.forEach(p => {
            bodyAdm.innerHTML += `<tr><td>${p.nome}</td><td><button class="btn-danger" onclick="deletarPlayer(${p.id})">Deletar</button></td></tr>`;
        });
    }

    // 🔥 FIX: Estas funções ficam fora dos IFs condicionais das tabelas para que os 
    // seletores de jogadores carreguem perfeitamente em todas as telas (Criador de partidas)!
    gerarSlotsTime('slotsTimeAzul', 'azul');
    gerarSlotsTime('slotsTimeLaranja', 'laranja');
    configurarFiltroDuplicatas();
}

// Nova função para revelar/esconder a senha ao clicar no olho
function alternarVisibilidadeSenha() {
    const campoSenha = document.getElementById("admSenha");
    const botaoOlho = document.getElementById("btnAlternarSenha");
    
    if (campoSenha.type === "password") {
        campoSenha.type = "text";
        botaoOlho.innerText = "🔒"; // Muda o ícone para indicar que pode esconder de novo
        botaoOlho.style.color = "#ffaa00"; // Destaca em dourado quando visível
    } else {
        campoSenha.type = "password";
        botaoOlho.innerText = "👁️";
        botaoOlho.style.color = "#b7c1d1";
    }
}

function gerarSlotsTime(containerId, prefixo) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    for(let i = 1; i <= 5; i++) {
        let options = `<option value="">-- Selecionar --</option>`;
        listaGlobalPlayers.forEach(p => { options += `<option value="${p.id}">${p.nome}</option>`; });
        container.innerHTML += `
            <div class="player-row" data-time="${prefixo}">
                <select class="p-id select-player-lobby">${options}</select>
                <input type="number" class="p-k" placeholder="K">
                <input type="number" class="p-d" placeholder="D">
            </div>
        `;
    }
}

// Geração dinâmica dos seletores de placar de 0 a 8 no topo (CORRIGIDA)
function gerarOpcoesPlacar() {
    // Insere os campos de placar dinamicamente no topo do formulário caso não existam no index.html
    if (!document.getElementById('placarAzul')) {
        const inputMapa = document.getElementById('partidaMapa');
        const containerPlacar = document.createElement('div');
        containerPlacar.className = 'lobby-config-input';
        containerPlacar.style.display = 'flex';
        containerPlacar.style.gap = '15px';
        containerPlacar.style.marginBottom = '15px';
        containerPlacar.innerHTML = `
            <div style="flex:1;">
                <label style="font-size:12px; color:#5289ff; font-weight:bold;">Placar Time Azul</label>
                <select id="placarAzul" style="margin-top:5px;"></select>
            </div>
            <div style="flex:1;">
                <label style="font-size:12px; color:#ff9138; font-weight:bold;">Placar Time Laranja</label>
                <select id="placarLaranja" style="margin-top:5px;"></select>
            </div>
        `;
        inputMapa.parentNode.insertBefore(containerPlacar, inputMapa.nextSibling);
    }

    const selAzul = document.getElementById('placarAzul');
    const selLaranja = document.getElementById('placarLaranja');
    
    let options = "";
    for(let i = 0; i <= 8; i++) {
        options += `<option value="${i}">${i}</option>`;
    }
    selAzul.innerHTML = options;
    selLaranja.innerHTML = options;
    
    selAzul.value = "7";
    selLaranja.value = "5";
}

function configurarFiltroDuplicatas() {
    const containerPartidas = document.getElementById('tab-adm-partidas');
    containerPartidas.addEventListener('change', (e) => {
        if (e.target.classList.contains('select-player-lobby')) {
            atualizarOpcoesDisponiveis();
        }
    });
}

function atualizarOpcoesDisponiveis() {
    const todosSelects = document.querySelectorAll('.select-player-lobby');
    const idsEscolhidos = Array.from(todosSelects).map(s => s.value).filter(id => id !== "");

    todosSelects.forEach(selectAtual => {
        const valorAntigo = selectAtual.value;
        let htmlOpcoes = `<option value="">-- Selecionar --</option>`;
        
        listaGlobalPlayers.forEach(p => {
            if (!idsEscolhidos.includes(p.id.toString()) || p.id.toString() === valorAntigo) {
                htmlOpcoes += `<option value="${p.id}">${p.nome}</option>`;
            }
        });
        selectAtual.innerHTML = htmlOpcoes;
        selectAtual.value = valorAntigo;
    });
}

async function cadastrarPlayer() {
    const nome = document.getElementById('admNovoPlayerNome').value;
    if(!nome.trim()) return alert("Nome inválido");
    await fetch('/players', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id: Date.now(), nome, kills: 0, deaths: 0, wins: 0, losses: 0 })
    });
    document.getElementById('admNovoPlayerNome').value = "";
    carregarPlayers();
}

async function deletarPlayer(id) {
    if(confirm("Deseja apagar este jogador?")) {
        await fetch(`/players/${id}`, { method: 'DELETE' });
        carregarPlayers();
    }
}

async function carregarPartidas() {
    const res = await fetch('/matches');
    listaGlobalMatches = await res.json();
    
    const divPublica = document.getElementById('listaPartidasPublica');
    const divDelecao = document.getElementById('listaPartidasPainelDelecao');
    divPublica.innerHTML = "";
    divDelecao.innerHTML = "";

    listaGlobalMatches.forEach(match => {
        const ptsAzul = match.timeAzul.pontuacao !== undefined ? match.timeAzul.pontuacao : "-";
        const ptsLaranja = match.timeLaranja.pontuacao !== undefined ? match.timeLaranja.pontuacao : "-";

        divPublica.innerHTML += `
            <div class="match-summary-card" onclick="abrirDetalhesR6(${match.id})">
                <div class="match-summary-info">
                    <span>🗺️ ${match.mapa}</span>
                    <span style="color:#5289ff;">${match.timeAzul.nome} [${ptsAzul}]</span> vs 
                    <span style="color:#ff9138;">[${ptsLaranja}] ${match.timeLaranja.nome}</span>
                </div>
                <button class="btn-primary" style="width:auto; padding:5px 15px;">Placar R6</button>
            </div>
        `;

        divDelecao.innerHTML += `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; background:#1f2636; padding:10px; border-radius:4px;">
                <span>ID: ${match.id} - Mapa: ${match.mapa} (${ptsAzul} x ${ptsLaranja})</span>
                <div>
                    <button class="btn-primary" style="width:auto; padding:5px 10px; background:#ffaa00; margin-right:5px;" onclick="prepararEdicaoPartida(${match.id})">Editar</button>
                    <button class="btn-danger" onclick="deletarPartida(${match.id})">Excluir</button>
                </div>
            </div>
        `;
    });
}

function coletarTimeArray(containerId) {
    const rows = document.querySelectorAll(`#${containerId} .player-row`);
    const arr = [];
    rows.forEach(row => {
        const id = row.querySelector('.p-id').value;
        const kills = parseInt(row.querySelector('.p-k').value) || 0;
        const deaths = parseInt(row.querySelector('.p-d').value) || 0;
        if(id) arr.push({ id, kills, deaths });
    });
    return arr;
}

async function salvarPartida() {
    const mapa = document.getElementById('partidaMapa').value;
    const nomeAzul = document.getElementById('nomeTimeAzul').value || "Time Azul";
    const nomeLaranja = document.getElementById('nomeTimeLaranja').value || "Time Laranja";
    const matchId = document.getElementById('editMatchId').value;

    const scoreAzul = parseInt(document.getElementById('placarAzul').value);
    const scoreLaranja = parseInt(document.getElementById('placarLaranja').value);

    if(!mapa) return alert("Preencha o nome do mapa.");

    // VALIDAÇÕES DO PLACAR EXIGIDAS
    if (scoreAzul === scoreLaranja) {
        return alert("ERRO DE REGRA: No Rainbow Six Siege não existem empates! Um time deve vencer o round/overtime obrigatoriamente.");
    }

    const pAzul = coletarTimeArray('slotsTimeAzul');
    const pLaranja = coletarTimeArray('slotsTimeLaranja');

    if (pAzul.length !== 5 || pLaranja.length !== 5) {
        return alert("ERRO CRÍTICO: Preencha obrigatoriamente os 5 jogadores de cada time (Total: 10 players).");
    }

    const todosIds = [...pAzul, ...pLaranja].map(p => p.id);
    const conjuntoIds = new Set(todosIds);
    if(conjuntoIds.size !== 10) {
        return alert("ERRO: Existem jogadores duplicados escalados na partida!");
    }

    // Define de forma automatizada quem levou a vitória com base no placar selecionado
    const resultadoAzul = scoreAzul > scoreLaranja ? 'vitoria' : 'derrota';
    const resultadoLaranja = scoreLaranja > scoreAzul ? 'vitoria' : 'derrota';

    const payload = {
        mapa,
        timeAzul: { nome: nomeAzul, resultado: resultadoAzul, pontuacao: scoreAzul, players: pAzul },
        timeLaranja: { nome: nomeLaranja, resultado: resultadoLaranja, pontuacao: scoreLaranja, players: pLaranja }
    };

    const url = matchId ? `/matches/${matchId}` : '/matches';
    const method = matchId ? 'PUT' : 'POST';

    await fetch(url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    alert(matchId ? "Partida Atualizada!" : "Partida Gravada com sucesso!");
    cancelarEdicaoPartida();
    await carregarPlayers();
    await carregarPartidas();
    switchTab('partidas');
}

function prepararEdicaoPartida(id) {
    const match = listaGlobalMatches.find(m => m.id === id);
    if(!match) return;

    document.getElementById('tituloFormPartida').innerText = `Editando Partida (ID: ${match.id})`;
    document.getElementById('editMatchId').value = match.id;
    document.getElementById('partidaMapa').value = match.mapa;
    document.getElementById('nomeTimeAzul').value = match.timeAzul.nome;
    document.getElementById('nomeTimeLaranja').value = match.timeLaranja.nome;
    
    // Seta os seletores para os placares salvos anteriormente
    document.getElementById('placarAzul').value = match.timeAzul.pontuacao !== undefined ? match.timeAzul.pontuacao : "7";
    document.getElementById('placarLaranja').value = match.timeLaranja.pontuacao !== undefined ? match.timeLaranja.pontuacao : "5";
    
    document.getElementById('btnCancelarEdicao').style.display = "inline-block";

    const preencherSlots = (containerId, playersArray) => {
        const rows = document.querySelectorAll(`#${containerId} .player-row`);
        rows.forEach((row, idx) => {
            if(playersArray[idx]) {
                row.querySelector('.p-id').value = playersArray[idx].id;
                row.querySelector('.p-k').value = playersArray[idx].kills;
                row.querySelector('.p-d').value = playersArray[idx].deaths;
            }
        });
    };

    preencherSlots('slotsTimeAzul', match.timeAzul.players);
    preencherSlots('slotsTimeLaranja', match.timeLaranja.players);
    
    atualizarOpcoesDisponiveis();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelarEdicaoPartida() {
    document.getElementById('tituloFormPartida').innerText = "Lançar Nova Partida (10 Players Obrigatórios)";
    document.getElementById('editMatchId').value = "";
    document.getElementById('partidaMapa').value = "";
    document.getElementById('nomeTimeAzul').value = "Time Azul";
    document.getElementById('nomeTimeLaranja').value = "Time Laranja";
    document.getElementById('placarAzul').value = "7";
    document.getElementById('placarLaranja').value = "5";
    document.getElementById('btnCancelarEdicao').style.display = "none";
    gerarSlotsTime('slotsTimeAzul', 'azul');
    gerarSlotsTime('slotsTimeLaranja', 'laranja');
    atualizarOpcoesDisponiveis();
}

async function deletarPartida(id) {
    if(confirm("Excluir partida e reverter pontuações?")) {
        await fetch(`/matches/${id}`, { method: 'DELETE' });
        await carregarPlayers();
        await carregarPartidas();
    }
}

function abrirDetalhesR6(id) {
    const match = listaGlobalMatches.find(m => m.id === id);
    if(!match) return;

    // 1. Atualiza o título do mapa primeiro
    const mapaElemento = document.getElementById('m-mapa');
    if (mapaElemento) {
        mapaElemento.innerText = match.mapa;
    }

    // 2. Define as pontuações e reconstrói o banner central com os nomes corretos dos times
    const pA = match.timeAzul.pontuacao !== undefined ? match.timeAzul.pontuacao : (match.timeAzul.resultado === 'vitoria' ? '7' : '0');
    const pL = match.timeLaranja.pontuacao !== undefined ? match.timeLaranja.pontuacao : (match.timeLaranja.resultado === 'vitoria' ? '7' : '0');
    
    const bannerContainer = document.querySelector('.r6-score-banner');
    if (bannerContainer) {
        bannerContainer.innerHTML = `
            <span class="r6-team-name-input-display" id="m-t1-nome" style="color: #5289ff;">${match.timeAzul.nome}</span>
            <span class="r6-score-number">${pA}</span>
            <span style="color: #666; font-weight:bold;">VS</span>
            <span class="r6-score-number" style="color: #ff9138;">${pL}</span>
            <span class="r6-team-name-input-display" id="m-t2-nome" style="color: #ff9138;">${match.timeLaranja.nome}</span>
        `;
    }

    // 3. Função interna para calcular o KD do jogador na partida específica
    const calcularKdPartida = p => p.deaths === 0 ? p.kills : p.kills / p.deaths;

    // Ordena as listas de jogadores pelo KD da partida (do maior para o menor)
    const playersAzulOrdenados = [...match.timeAzul.players].sort((a, b) => calcularKdPartida(b) - calcularKdPartida(a));
    const playersLaranjaOrdenados = [...match.timeLaranja.players].sort((a, b) => calcularKdPartida(b) - calcularKdPartida(a));

    // 4. Função interna para gerar o HTML de cada bloco de tabela (Azul ou Laranja)
    const gerarTabelaTime = (playersList, className, resText) => {
        let linhas = "";
        playersList.forEach(p => {
            const playerObj = listaGlobalPlayers.find(pg => pg.id === parseInt(p.id));
            const nick = playerObj ? playerObj.nome : "Desconectado";
            const kdPartida = calcularKdPartida(p);
            
            linhas += `
                <tr class="${className}">
                    <td style="font-weight:bold;">${nick}</td>
                    <td class="${obterClasseKD(kdPartida)}">${kdPartida.toFixed(2)}</td>
                    <td style="color:#ffaa00; font-weight:bold;">${p.kills}</td>
                    <td>${p.deaths}</td>
                </tr>
            `;
        });

        return `
            <div class="table-wrapper" style="border: 1px solid #2d384c; border-radius: 4px; overflow: hidden;">
                <table class="r6-scoreboard-table">
                    <thead>
                        <tr style="background: #161b26;">
                            <th style="color: #fff;">Jogador (${resText})</th>
                            <th>K/D</th>
                            <th>K</th>
                            <th>D</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhas}
                    </tbody>
                </table>
            </div>
        `;
    };

    // 5. Organiza a estrutura de colunas lado a lado no container
    const modalContent = document.querySelector('.r6-modal-content');
    let containerPlacar = document.getElementById('r6-split-container');
    
    if (!containerPlacar) {
        containerPlacar = document.createElement('div');
        containerPlacar.id = 'r6-split-container';
        containerPlacar.className = 'r6-scoreboard-container';
        modalContent.appendChild(containerPlacar);
    }

    // Esconde a tabela antiga de uma coluna se ela ainda existir solta
    const tabelaAntiga = document.querySelector('.r6-scoreboard-table');
    if(tabelaAntiga && tabelaAntiga.parentNode && tabelaAntiga.parentNode.id !== 'r6-split-container' && !tabelaAntiga.parentNode.classList.contains('table-wrapper')) {
        tabelaAntiga.style.display = 'none';
    }

    // Renderiza o HTML final lado a lado
    const htmlAzul = gerarTabelaTime(playersAzulOrdenados, 'r6-row-blue', match.timeAzul.resultado.toUpperCase());
    const htmlLaranja = gerarTabelaTime(playersLaranjaOrdenados, 'r6-row-orange', match.timeLaranja.resultado.toUpperCase());
    
    containerPlacar.innerHTML = htmlAzul + htmlLaranja;

    // 6. Exibe o Modal na tela
    document.getElementById('modalR6').style.display = 'block';
}

function fecharModalR6(e) {
    if(e.target.id === 'modalR6') {
        document.getElementById('modalR6').style.display = 'none';
    }
}

async function executarLogin() {
    const usuario = document.getElementById("admUsuario").value;
    const senha = document.getElementById("admSenha").value;

    if (!usuario || !senha) {
        return alert("Por favor, preencha todos os campos.");
    }

    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usuario, senha })
        });

        const resultado = await response.json();

        if (resultado.success) {
            localStorage.setItem("admin", "true");
            alert("Login realizado com sucesso!");
            window.location.reload(); // Recarrega para aplicar os novos blocos do ADM
        } else {
            alert("Usuário ou senha incorretos.");
        }
    } catch (err) {
        console.error("Erro ao tentar fazer login:", err);
    }
}
function verificarEstadoAdmin() {
    const eAdmin = localStorage.getItem("admin") === "true";
    
    // Mostra ou esconde as abas superiores de ADM
    const tabPlayersBtn = document.getElementById("tab-adm-players-btn");
    const tabPartidasBtn = document.getElementById("tab-adm-partidas-btn");
    if (tabPlayersBtn) tabPlayersBtn.style.display = eAdmin ? "inline-block" : "none";
    if (tabPartidasBtn) tabPartidasBtn.style.display = eAdmin ? "inline-block" : "none";
    
    // Elementos da página de Login
    const loginForm = document.getElementById("loginFormContainer");
    const logoutPanel = document.getElementById("logoutContainer");
    
    if (eAdmin) {
        if (loginForm) loginForm.style.display = "none";
        if (logoutPanel) logoutPanel.style.display = "flex"; // Revela os dois blocos de ADM empilhados
    } else {
        if (loginForm) loginForm.style.display = "block";    // Revela unicamente o campo para logar
        if (logoutPanel) logoutPanel.style.display = "none";
    }
}

function ejecutarLogout() { 
    localStorage.removeItem("admin"); 
    window.location.reload(); // Recarrega o app limpando o estado de ADM
}
// 3. Adicione estas duas funções de controle em qualquer parte do seu app.js:
async function carregarConfiguracaoLobby() {
    try {
        const res = await fetch('/config');
        const config = await res.json();
        
        if (config && config.nomeLobby) {
            // Atualiza o Título Principal no Header do site
            const tituloHeader = document.getElementById('nomeLobbyPrincipal');
            if (tituloHeader) tituloHeader.innerText = config.nomeLobby;
            
            // Preenche o campo de texto dentro do painel para o Admin ver o valor atual
            const inputLobby = document.getElementById('inputNomeLobby');
            if (inputLobby) inputLobby.value = config.nomeLobby;
        }
    } catch (err) {
        console.error("Erro ao obter a configuração do lobby:", err);
    }
}

async function salvarNomeLobby() {
    const novoNome = document.getElementById('inputNomeLobby').value;
    
    if (!novoNome.trim()) {
        return alert("Por favor, insira um nome válido para o lobby.");
    }

    try {
        const res = await fetch('/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nomeLobby: novoNome.trim() })
        });
        
        const dados = await res.json();
        if (dados.success) {
            alert("Nome do Lobby atualizado com sucesso!");
            await carregarConfiguracaoLobby(); // Recarrega instantaneamente os elementos visuais
        } else {
            alert("Erro ao salvar as configurações.");
        }
    } catch (err) {
        console.error("Erro ao salvar o nome do lobby:", err);
        alert("Não foi possível estabelecer conexão com o servidor.");
    }
}

window.onload = inicializarSistema;
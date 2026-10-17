const SUPABASE_URL = 'https://ydklibjdzcwennwrblwi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2_PrY5UOPkEPJfucET16DA_i_zSx2Bx';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORAGE_KEY = "volley_user_v1";
let currentUser = JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
let activeMatchIdForPresence = null;
let cachePartiteGlobali = []; // Conserva le partite per il menu a tendina

document.addEventListener('DOMContentLoaded', () => {
    aggiornaInterfaccia();
    testaConnessioneGiocatrici();

    const matchForm = document.getElementById('matchForm');
    if (matchForm) {
        matchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('matchId').value;
            const avversario = document.getElementById('avversario').value.trim();
            const dataOra = document.getElementById('dataOra').value;
            const luogo = document.getElementById('luogo').value;

            if (!avversario || !dataOra) {
                alert('Compila tutti i campi!');
                return;
            }

            let error;
            if (id) {
                const res = await db.from('partite').update({ avversario, data_ora: dataOra, luogo }).eq('id', id);
                error = res.error;
            } else {
                const res = await db.from('partite').insert([{ avversario, data_ora: dataOra, luogo }]);
                error = res.error;
            }

            if (error) {
                alert('Errore nel salvataggio: ' + error.message);
            } else {
                matchForm.reset();
                document.getElementById('matchId').value = '';
                window.toggleMatchForm(false);
                fetchMatches();
            }
        });
    }
});

// --- GESTIONE TEMA CHIARO / SCURO (LAMPADINA) ---
window.toggleTheme = function () {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('volley_theme', isDark ? 'dark' : 'light');
};

// --- GESTIONE MENU LATERALE ---
window.toggleSidebar = function (apri) {
    const drawer = document.getElementById('sidebarDrawer');
    const overlay = document.getElementById('sidebarOverlay');
    if (!drawer || !overlay) return;

    if (apri) {
        overlay.classList.remove('hidden');
        setTimeout(() => drawer.classList.remove('-translate-x-full'), 10);
    } else {
        drawer.classList.add('-translate-x-full');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
};

window.mostraSezione = function (sezione) {
    toggleSidebar(false);
    const secCalendario = document.getElementById('section-calendario');
    const secRiepilogo = document.getElementById('section-riepilogo');

    if (sezione === 'calendario') {
        secCalendario.classList.remove('hidden');
        secRiepilogo.classList.add('hidden');
    } else if (sezione === 'riepilogo') {
        secCalendario.classList.add('hidden');
        secRiepilogo.classList.remove('hidden');
        popolaSelectRiepilogo();
    }
};

async function testaConnessioneGiocatrici() {
    const { data, error } = await db.from('giocatrici').select('*');
    if (error) {
        console.error("Errore di connessione a Supabase:", error);
    } else {
        console.log("Connessione OK! Elenco giocatrici dal DB:", data);
    }
}

window.eseguiLogin = async function () {
    const inputNome = document.getElementById('authNome');
    const inputCognome = document.getElementById('authCognome');

    if (!inputNome || !inputCognome) {
        alert('Campi di login non trovati.');
        return;
    }

    const nomeVal = inputNome.value.trim();
    const cognomeVal = inputCognome.value.trim();

    if (!nomeVal || !cognomeVal) {
        alert('Inserisci sia nome che cognome.');
        return;
    }

    try {
        const { data, error } = await db
            .from('giocatrici')
            .select('*')
            .ilike('nome', nomeVal)
            .ilike('cognome', cognomeVal);

        if (error) {
            alert('Errore dal database: ' + error.message);
            return;
        }

        if (!data || data.length === 0) {
            alert('Giocatrice non trovata nel database della squadra. Controlla come hai scritto nome e cognome.');
            return;
        }

        const giocatrice = data[0];

        currentUser = {
            id: giocatrice.id,
            nome: giocatrice.nome,
            cognome: giocatrice.cognome,
            ruolo: giocatrice.ruolo
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
        aggiornaInterfaccia();

    } catch (err) {
        console.error('Errore di connessione:', err);
        alert('Errore di connessione al database: ' + err.message);
    }
};

window.logoutUser = function () {
    toggleSidebar(false);
    localStorage.removeItem(STORAGE_KEY);
    currentUser = null;

    const inputNome = document.getElementById('authNome');
    const inputCognome = document.getElementById('authCognome');
    if (inputNome) inputNome.value = '';
    if (inputCognome) inputCognome.value = '';

    aggiornaInterfaccia();
};

function aggiornaInterfaccia() {
    const viewAuth = document.getElementById("view-auth");
    const viewDashboard = document.getElementById("view-dashboard");

    if (!currentUser) {
        if (viewAuth) viewAuth.style.display = "block";
        if (viewDashboard) viewDashboard.style.display = "none";
    } else {
        if (viewAuth) viewAuth.style.display = "none";
        if (viewDashboard) viewDashboard.style.display = "block";

        // FORZA SEMPRE IL CALENDARIO ALL'ACCENSIONE O LOGIN
        if (typeof window.mostraSezione === 'function') {
            window.mostraSezione('calendario');
        }

        const dispName = document.getElementById('currentUserDisplay');
        const dispRole = document.getElementById('currentUserRole');
        if (dispName) dispName.textContent = `${currentUser.nome} ${currentUser.cognome}`;
        if (dispRole) dispRole.textContent = currentUser.ruolo;

        fetchMatches();
    }
}

window.toggleMatchForm = function (isEdit = false) {
    const container = document.getElementById('matchFormContainer');
    if (container) container.classList.toggle('hidden');
    const matchForm = document.getElementById('matchForm');
    if (!isEdit && matchForm) {
        matchForm.reset();
        document.getElementById('matchId').value = '';
        document.getElementById('formTitle').textContent = 'Nuova Partita';
    }
};

window.editMatch = function (match) {
    document.getElementById('matchId').value = match.id;
    document.getElementById('avversario').value = match.avversario;
    document.getElementById('dataOra').value = match.data_ora ? match.data_ora.slice(0, 16) : '';
    document.getElementById('luogo').value = match.luogo || 'Casa';
    document.getElementById('formTitle').textContent = 'Modifica Partita';
    document.getElementById('matchFormContainer').classList.remove('hidden');
};

window.deleteMatch = async function (id) {
    if (confirm('Vuoi eliminare questa partita?')) {
        const { error } = await db.from('partite').delete().eq('id', id);
        if (!error) fetchMatches();
    }
};

async function fetchMatches() {
    const matchList = document.getElementById('matchList');
    if (!matchList) return;

    const { data, error } = await db
        .from('partite')
        .select(`*, presenze(giocatrice_id, presente)`)
        .order('data_ora', { ascending: true });

    if (error) {
        console.error('Errore caricamento partite:', error);
        return;
    }

    cachePartiteGlobali = data || [];
    matchList.innerHTML = '';

    if (cachePartiteGlobali.length === 0) {
        matchList.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Nessuna partita in programma.</p>';
        return;
    }

    cachePartiteGlobali.forEach(match => {
        const dateFormatted = new Date(match.data_ora).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

        let miaPresenza = null;
        if (currentUser && match.presenze) {
            const p = match.presenze.find(x => x.giocatrice_id === currentUser.id);
            if (p) miaPresenza = p.presente;
        }

        let badgeStatus = '<span class="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full font-medium">Non risposto</span>';
        if (miaPresenza === true) badgeStatus = '<span class="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full font-medium">Ci sono</span>';
        if (miaPresenza === false) badgeStatus = '<span class="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-full font-medium">Assente</span>';

        const card = document.createElement('div');
        card.className = "bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col space-y-3 transition-colors";
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div onclick="openPresenceModal('${match.id}', '${match.avversario.replace(/'/g, "\\'")}')" class="cursor-pointer flex-1">
                    <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-400">${match.luogo || 'Partita'}</span>
                    <h3 class="font-bold text-slate-800 dark:text-white text-base">vs ${match.avversario}</h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400">${dateFormatted}</p>
                    <div class="mt-2">${badgeStatus}</div>
                </div>
                <div class="flex space-x-1 items-center">
                    <!-- Icona Vettoriale Matita (Modifica) -->
                    <button type="button" onclick='editMatch(${JSON.stringify(match).replace(/'/g, "&#39;")})' class="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer" title="Modifica">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    </button>
                    <!-- Icona Vettoriale Cestino (Elimina) -->
                    <button type="button" onclick="deleteMatch('${match.id}')" class="p-2 text-slate-400 hover:text-rose-500 transition cursor-pointer" title="Elimina">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </div>
        `;
        matchList.appendChild(card);
    });

    popolaSelectRiepilogo();
}

// --- LOGICA SELECT E RIEPILOGO PRESENZE/RUOLI ---
function popolaSelectRiepilogo() {
    const select = document.getElementById('selectPartitaRiepilogo');
    if (!select) return;

    const valoreSalvato = select.value;
    select.innerHTML = '<option value="">-- Seleziona una partita --</option>';

    cachePartiteGlobali.forEach(m => {
        const dataFormatted = new Date(m.data_ora).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `vs ${m.avversario} (${dataFormatted})`;
        select.appendChild(opt);
    });

    if (valoreSalvato) {
        select.value = valoreSalvato;
    }
}

window.caricaDettaglioPartita = async function (matchId) {
    const container = document.getElementById('dettaglioPartitaContainer');
    const titolo = document.getElementById('dettaglioTitoloMatch');
    const divPresenti = document.getElementById('listaPresentiDettaglio');
    const divAssenti = document.getElementById('listaAssentiDettaglio');
    const divRuoli = document.getElementById('conteggioRuoliDettaglio');

    if (!matchId) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    divPresenti.innerHTML = '<p class="text-xs text-slate-400">Caricamento...</p>';
    divAssenti.innerHTML = '<p class="text-xs text-slate-400">Caricamento...</p>';
    divRuoli.innerHTML = '';

    // Scarichiamo l'elenco di tutte le giocatrici dal database
    const { data: giocatrici, error: errG } = await db.from('giocatrici').select('*');
    // Scarichiamo le presenze registrate per questa partita
    const { data: presenze, error: errP } = await db.from('presenze').select('*').eq('match_id', matchId);

    const matchInfo = cachePartiteGlobali.find(m => m.id === matchId);

    if (errG || errP || !matchInfo) {
        divPresenti.innerHTML = '<p class="text-xs text-rose-500">Errore nel caricamento dei dati.</p>';
        return;
    }

    titolo.textContent = `Partita vs ${matchInfo.avversario} `;

    let presentiList = [];
    let assentiList = [];
    let conteggioRuoli = {};

    giocatrici.forEach(g => {
        const registro = presenze.find(p => p.giocatrice_id === g.id);

        if (registro && registro.presente === true) {
            presentiList.push(g);
            conteggioRuoli[g.ruolo] = (conteggioRuoli[g.ruolo] || 0) + 1;
        } else if (registro && registro.presente === false) {
            assentiList.push(g);
        }
    });

    // Mostra Presenti
    if (presentiList.length === 0) {
        divPresenti.innerHTML = '<p class="text-xs text-slate-400 italic">Nessuna presenza confermata.</p>';
    } else {
        divPresenti.innerHTML = presentiList.map(g => `
        < div class="flex justify-between items-center bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 rounded-xl border border-emerald-100 dark:border-emerald-900/40" >
                <span class="font-semibold text-slate-700 dark:text-slate-200">${g.nome} ${g.cognome}</span>
                <span class="text-xs bg-emerald-200 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-md font-medium">${g.ruolo}</span>
            </div >
        `).join('');
    }

    // Mostra Assenti
    if (assentiList.length === 0) {
        divAssenti.innerHTML = '<p class="text-xs text-slate-400 italic">Nessun\'assenza registrata.</p>';
    } else {
        divAssenti.innerHTML = assentiList.map(g => `
        < div class="flex justify-between items-center bg-rose-50 dark:bg-rose-950/30 px-3 py-2 rounded-xl border border-rose-100 dark:border-rose-900/40" >
                <span class="font-semibold text-slate-700 dark:text-slate-200">${g.nome} ${g.cognome}</span>
                <span class="text-xs bg-rose-200 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded-md font-medium">${g.ruolo}</span>
            </div >
        `).join('');
    }

    // Mostra Conteggio Ruoli in basso
    const ruoliFissi = ['Palleggiatrice', 'Opposto', 'Centro', 'Banda', 'Libero'];
    divRuoli.innerHTML = ruoliFissi.map(r => {
        const quanti = conteggioRuoli[r] || 0;
        return `
        < div class="bg-indigo-800/60 dark:bg-indigo-900/60 p-2.5 rounded-xl flex justify-between items-center border border-indigo-700/60" >
                <span class="text-xs text-indigo-200">${r}</span>
                <span class="font-bold text-base text-white">${quanti}</span>
            </div >
        `;
    }).join('');
};

window.openPresenceModal = function (matchId, avversario) {
    if (!currentUser) return;
    activeMatchIdForPresence = matchId;
    document.getElementById('modalMatchTitle').textContent = `vs ${avversario} `;
    document.getElementById('modalMatchInfo').textContent = `Conferma per: ${currentUser.nome} ${currentUser.cognome} (${currentUser.ruolo})`;
    document.getElementById('presenceModal').classList.remove('hidden');
};

window.closePresenceModal = function () {
    document.getElementById('presenceModal').classList.add('hidden');
    activeMatchIdForPresence = null;
};

window.updatePresence = async function (presente) {
    if (!currentUser || !activeMatchIdForPresence) return;

    const { error } = await db.from('presenze').upsert({
        match_id: activeMatchIdForPresence,
        giocatrice_id: currentUser.id,
        presente: presente
    }, { onConflict: 'match_id,giocatrice_id' });

    if (error) {
        alert('Errore nel salvataggio: ' + error.message);
    } else {
        window.closePresenceModal();
        fetchMatches();
    }
};
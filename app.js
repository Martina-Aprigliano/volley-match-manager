const SUPABASE_URL = 'https://ydklibjdzcwennwrblwi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2_PrY5UOPkEPJfucET16DA_i_zSx2Bx';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORAGE_KEY = "volley_user_v1";
let currentUser = JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
let activeMatchIdForPresence = null;
let cachePartiteGlobali = [];
let mostraSoloArchivio = false;

// Indirizzo fisso della palestra di casa
const INDIRIZZO_CASA = "Oratorio Don Bosco Carugate, Via Papa Pio XI, 36, 20061 Carugate MI";

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
            const indirizzo = document.getElementById('indirizzo').value.trim();

            if (!avversario || !dataOra) {
                alert('Compila tutti i campi!');
                return;
            }

            let error;
            if (id) {
                const res = await db.from('partite').update({ avversario, data_ora: dataOra, luogo, indirizzo }).eq('id', id);
                error = res.error;
            } else {
                const res = await db.from('partite').insert([{ avversario, data_ora: dataOra, luogo, indirizzo }]);
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

// --- GESTIONE AUTOCOMPILAZIONE INDIRIZZO CASA ---
window.gestisciCambioLuogo = function (luogoSelezionato) {
    const inputIndirizzo = document.getElementById('indirizzo');
    if (!inputIndirizzo) return;

    if (luogoSelezionato === 'Casa') {
        inputIndirizzo.value = INDIRIZZO_CASA;
    } else {
        if (inputIndirizzo.value === INDIRIZZO_CASA) {
            inputIndirizzo.value = '';
        }
    }
};

// --- GESTIONE TEMA CHIARO / SCURO ---
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

    rimuoviFiltriArchivio(); // Pulisce i filtri dell'archivio se si cambia sezione

    if (sezione === 'calendario') {
        mostraSoloArchivio = false;
        const headerTitle = document.getElementById('sectionHeaderTitle');
        if (headerTitle) headerTitle.innerText = "Calendario Partite";
        const addBtn = document.querySelector('button[onclick="toggleMatchForm()"]');
        if (addBtn) addBtn.style.display = 'flex';

        secCalendario.classList.remove('hidden');
        secRiepilogo.classList.add('hidden');
        renderMatches();
    } else if (sezione === 'riepilogo') {
        secCalendario.classList.add('hidden');
        secRiepilogo.classList.remove('hidden');
        ripristinaSelectRiepilogoStruttura();
        popolaSelectRiepilogo();
    }
};

window.showArchivedMatches = function () {
    toggleSidebar(false);
    mostraSoloArchivio = true;

    const secCalendario = document.getElementById('section-calendario');
    const secRiepilogo = document.getElementById('section-riepilogo');
    if (secCalendario) secCalendario.classList.remove('hidden');
    if (secRiepilogo) secRiepilogo.classList.add('hidden');

    const headerTitle = document.getElementById('sectionHeaderTitle');
    if (headerTitle) headerTitle.innerText = "Archivio Partite Passate";

    const addBtn = document.querySelector('button[onclick="toggleMatchForm()"]');
    if (addBtn) addBtn.style.display = 'none';

    renderFiltriArchivio();
    renderMatches();
};

// --- GESTIONE FILTRI ARCHIVIO ---
function renderFiltriArchivio() {
    let filtroContainer = document.getElementById('archivioFiltriContainer');
    if (!filtroContainer) {
        filtroContainer = document.createElement('div');
        filtroContainer.id = 'archivioFiltriContainer';
        filtroContainer.className = "bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-2 mb-3";

        const matchList = document.getElementById('matchList');
        if (matchList && matchList.parentNode) {
            matchList.parentNode.insertBefore(filtroContainer, matchList);
        }
    }

    filtroContainer.innerHTML = `
        <div class="space-y-2">
            <input type="text" id="filtroTesto" placeholder="Cerca squadra avversaria..." oninput="renderMatches()"
                class="w-full p-2.5 border dark:border-slate-600 rounded-xl text-xs bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            
            <div class="grid grid-cols-2 gap-2">
                <select id="filtroLuogo" onchange="renderMatches()"
                    class="w-full p-2 border dark:border-slate-600 rounded-xl text-xs bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none">
                    <option value="">Tutti i luoghi</option>
                    <option value="Casa">Casa</option>
                    <option value="Trasferta">Trasferta</option>
                </select>

                <select id="filtroMeseAnno" onchange="renderMatches()"
                    class="w-full p-2 border dark:border-slate-600 rounded-xl text-xs bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none">
                    <option value="">Tutti i periodi</option>
                </select>
            </div>
        </div>
    `;

    popolaOpzioniMeseAnno();
}

function popolaOpzioniMeseAnno() {
    const selectMese = document.getElementById('filtroMeseAnno');
    if (!selectMese) return;

    const valoreCorrente = selectMese.value;
    const adesso = new Date();
    const partitePassate = cachePartiteGlobali.filter(m => new Date(m.data_ora) < adesso);

    const mesiSet = new Set();
    partitePassate.forEach(m => {
        const d = new Date(m.data_ora);
        const anno = d.getFullYear();
        const mese = String(d.getMonth() + 1).padStart(2, '0');
        mesiSet.add(`${anno}-${mese}`);
    });

    let optionsHtml = '<option value="">Tutti i periodi</option>';
    Array.from(mesiSet).sort().reverse().forEach(ym => {
        const [anno, mese] = ym.split('-');
        const nomeMese = new Date(anno, mese - 1).toLocaleString('it-IT', { month: 'long', year: 'numeric' });
        const nomeMeseFormatted = nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1);
        optionsHtml += `<option value="${ym}">${nomeMeseFormatted}</option>`;
    });

    selectMese.innerHTML = optionsHtml;
    selectMese.value = valoreCorrente;
}

window.rimuoviFiltriArchivio = function () {
    const filtroContainer = document.getElementById('archivioFiltriContainer');
    if (filtroContainer) filtroContainer.remove();
};

async function testaConnessioneGiocatrici() {
    const { data, error } = await db.from('giocatrici').select('*');
    if (error) console.error("Errore di connessione a Supabase:", error);
}

window.eseguiLogin = async function () {
    const inputNome = document.getElementById('authNome');
    const inputCognome = document.getElementById('authCognome');

    if (!inputNome || !inputCognome) return;

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

        if (error || !data || data.length === 0) {
            alert('Giocatrice non trovata nel database della squadra.');
            return;
        }

        currentUser = {
            id: data[0].id,
            nome: data[0].nome,
            cognome: data[0].cognome,
            ruolo: data[0].ruolo
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
        aggiornaInterfaccia();
    } catch (err) {
        alert('Errore di connessione: ' + err.message);
    }
};

window.logoutUser = function () {
    toggleSidebar(false);
    localStorage.removeItem(STORAGE_KEY);
    currentUser = null;
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
        if (typeof window.mostraSezione === 'function') window.mostraSezione('calendario');

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
        document.getElementById('indirizzo').value = INDIRIZZO_CASA;
    }
};

window.editMatch = function (match) {
    document.getElementById('matchId').value = match.id;
    document.getElementById('avversario').value = match.avversario;
    document.getElementById('dataOra').value = match.data_ora ? match.data_ora.slice(0, 16) : '';
    document.getElementById('luogo').value = match.luogo || 'Casa';
    document.getElementById('indirizzo').value = match.indirizzo || '';
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
    const { data, error } = await db
        .from('partite')
        .select(`*, presenze(giocatrice_id, presente)`)
        .order('data_ora', { ascending: true });

    if (error) {
        console.error('Errore caricamento partite:', error);
        return;
    }

    cachePartiteGlobali = data || [];
    renderMatches();
    popolaSelectRiepilogo();
}

function renderMatches() {
    const matchList = document.getElementById('matchList');
    if (!matchList) return;

    matchList.innerHTML = '';
    const adesso = new Date();

    const partitePassate = cachePartiteGlobali.filter(m => new Date(m.data_ora) < adesso);
    const partiteFuture = cachePartiteGlobali.filter(m => new Date(m.data_ora) >= adesso);

    // SE SIAMO NELLA SEZIONE ARCHIVIO CON FILTRI APPLICATI
    if (mostraSoloArchivio) {
        let filtrate = [...partitePassate];

        const testoQuery = document.getElementById('filtroTesto')?.value.toLowerCase().trim() || '';
        const luogoQuery = document.getElementById('filtroLuogo')?.value || '';
        const meseAnnoQuery = document.getElementById('filtroMeseAnno')?.value || '';

        if (testoQuery) {
            filtrate = filtrate.filter(m => m.avversario.toLowerCase().includes(testoQuery));
        }
        if (luogoQuery) {
            filtrate = filtrate.filter(m => m.luogo === luogoQuery);
        }
        if (meseAnnoQuery) {
            filtrate = filtrate.filter(m => {
                const d = new Date(m.data_ora);
                const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                return ym === meseAnnoQuery;
            });
        }

        filtrate.sort((a, b) => new Date(b.data_ora) - new Date(a.data_ora));

        if (filtrate.length === 0) {
            matchList.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Nessuna partita trovata con i filtri applicati.</p>';
            return;
        }

        filtrate.forEach(match => {
            matchList.appendChild(creaCardElement(match, true));
        });
        return;
    }

    // SE SIAMO NELLA HOME (CALENDARIO ATTIVO)
    if (cachePartiteGlobali.length === 0 || (partiteFuture.length === 0 && partitePassate.length === 0)) {
        matchList.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Nessuna partita in programma.</p>';
        return;
    }

    if (partiteFuture.length > 0) {
        const prossimaPartita = partiteFuture[0];
        const altreFuture = partiteFuture.slice(1);

        const wrapperProssima = document.createElement('div');
        wrapperProssima.className = "mb-4 space-y-2";
        wrapperProssima.innerHTML = `
            <div class="flex items-center space-x-2 pt-1">
                <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-md">Prossima Partita</span>
                <div class="flex-1 h-px bg-indigo-200 dark:bg-indigo-900"></div>
            </div>
        `;
        wrapperProssima.appendChild(creaCardElement(prossimaPartita, false, true));
        matchList.appendChild(wrapperProssima);

        if (altreFuture.length > 0) {
            const containerAltre = document.createElement('div');
            containerAltre.className = "space-y-3 mt-4";
            altreFuture.forEach(match => {
                containerAltre.appendChild(creaCardElement(match, false));
            });
            matchList.appendChild(containerAltre);
        }
    } else {
        matchList.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Non ci sono partite future in programma.</p>';
    }
}

function creaCardElement(match, isArchivio = false, isInEvidenza = false) {
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

    if (isInEvidenza) {
        card.className = "bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-md border-2 border-indigo-500 flex flex-col space-y-3 transition-colors";
    } else if (isArchivio) {
        card.className = "bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col space-y-3 transition-colors cursor-pointer hover:border-indigo-500";
    } else {
        card.className = "bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col space-y-3 transition-colors";
    }

    const clickAction = isArchivio
        ? `apriDettaglioArchivio('${match.id}')`
        : `openPresenceModal('${match.id}', '${match.avversario.replace(/'/g, "\\'")}')`;

    let mappaHtml = '';
    if (match.indirizzo && match.indirizzo.trim() !== '') {
        const encodedAddress = encodeURIComponent(match.indirizzo);
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

        mappaHtml = `
            <div class="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 space-y-2">
                <div class="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <svg class="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span class="truncate">${match.indirizzo}</span>
                </div>
                <a href="${googleMapsUrl}" target="_blank" onclick="event.stopPropagation()"
                   class="w-full bg-slate-100 hover:bg-indigo-50 dark:bg-slate-700/60 dark:hover:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-xs font-semibold py-2 px-3 rounded-xl flex items-center justify-center space-x-2 transition border border-slate-200 dark:border-slate-600">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
                    <span>Apri in Google Maps</span>
                </a>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="flex justify-between items-start">
            <div onclick="${clickAction}" class="cursor-pointer flex-1">
                <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-400">${match.luogo || 'Partita'}</span>
                <h3 class="font-bold text-slate-800 dark:text-white text-base">vs ${match.avversario}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">${dateFormatted}</p>
                <div class="mt-2">${!isArchivio ? badgeStatus : '<span class="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-full font-medium">Clicca per vedere il resoconto</span>'}</div>
            </div>
            <div class="flex space-x-1 items-center">
                ${!isArchivio ? `
                <button type="button" onclick='editMatch(${JSON.stringify(match).replace(/'/g, "&#39;")})' class="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer" title="Modifica">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button type="button" onclick="deleteMatch('${match.id}')" class="p-2 text-slate-400 hover:text-rose-500 transition cursor-pointer" title="Elimina">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
                ` : ''}
            </div>
        </div>
        ${mappaHtml}
    `;

    return card;
}

window.apriDettaglioArchivio = function (matchId) {
    mostraSezione('riepilogo');
    rimuoviFiltriArchivio();
    const matchInfo = cachePartiteGlobali.find(m => m.id === matchId);
    if (!matchInfo) return;

    const selectContainer = document.getElementById('selectPartitaRiepilogo').parentElement;
    const dataFormatted = new Date(matchInfo.data_ora).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

    selectContainer.innerHTML = `
        <h2 class="font-bold text-slate-800 dark:text-white text-base">Partita Archiviata</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">Resoconto storico della partita selezionata.</p>
        <div class="w-full p-3 bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 flex justify-between items-center cursor-default">
            <span>vs ${matchInfo.avversario} (${dataFormatted})</span>
            <span class="text-xs bg-slate-200 dark:bg-slate-600 px-2.5 py-1 rounded text-slate-500 dark:text-slate-300">Archiviata</span>
        </div>
        <button type="button" onclick="ripristinaSelectRiepilogoStruttura()" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline pt-1 inline-block cursor-pointer">← Torna alle partite future</button>
    `;

    caricaDettaglioPartita(matchId);
};

window.ripristinaSelectRiepilogoStruttura = function () {
    const container = document.getElementById('section-riepilogo');
    const boxCard = container.querySelector('.bg-white, .dark\\:bg-slate-800');
    if (boxCard) {
        boxCard.innerHTML = `
            <h2 class="font-bold text-slate-800 dark:text-white text-base">Seleziona Partita</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">Scegli la partita per visualizzare i convocati e il conteggio dei ruoli.</p>
            <select id="selectPartitaRiepilogo" onchange="caricaDettaglioPartita(this.value)"
                class="w-full p-3 border dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white">
                <option value="">-- Seleziona una partita --</option>
            </select>
        `;
        popolaSelectRiepilogo();
    }
    const dettaglioContainer = document.getElementById('dettaglioPartitaContainer');
    if (dettaglioContainer) dettaglioContainer.classList.add('hidden');
};

function popolaSelectRiepilogo() {
    const select = document.getElementById('selectPartitaRiepilogo');
    if (!select) return;

    const valoreSalvato = select.value;
    select.innerHTML = '<option value="">-- Seleziona una partita --</option>';

    const adesso = new Date();
    const partiteFuture = cachePartiteGlobali.filter(m => new Date(m.data_ora) >= adesso);

    partiteFuture.forEach(m => {
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

    const { data: giocatrici, error: errG } = await db.from('giocatrici').select('*');
    const { data: presenze, error: errP } = await db.from('presenze').select('*').eq('match_id', matchId);

    const matchInfo = cachePartiteGlobali.find(m => m.id === matchId);

    if (errG || errP || !matchInfo) {
        divPresenti.innerHTML = '<p class="text-xs text-rose-500">Errore nel caricamento dei dati.</p>';
        return;
    }

    titolo.textContent = `Partita vs ${matchInfo.avversario}`;

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

    if (presentiList.length === 0) {
        divPresenti.innerHTML = '<p class="text-xs text-slate-400 italic">Nessuna presenza confermata.</p>';
    } else {
        divPresenti.innerHTML = presentiList.map(g => `
            <div class="flex justify-between items-center bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                <span class="font-semibold text-slate-700 dark:text-slate-200">${g.nome} ${g.cognome}</span>
                <span class="text-xs bg-emerald-200 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-md font-medium">${g.ruolo}</span>
            </div>
        `).join('');
    }

    if (assentiList.length === 0) {
        divAssenti.innerHTML = '<p class="text-xs text-slate-400 italic">Nessun\'assenza registrata.</p>';
    } else {
        divAssenti.innerHTML = assentiList.map(g => `
            <div class="flex justify-between items-center bg-rose-50 dark:bg-rose-950/30 px-3 py-2 rounded-xl border border-rose-100 dark:border-rose-900/40">
                <span class="font-semibold text-slate-700 dark:text-slate-200">${g.nome} ${g.cognome}</span>
                <span class="text-xs bg-rose-200 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded-md font-medium">${g.ruolo}</span>
            </div>
        `).join('');
    }

    const ruoliFissi = ['Palleggiatrice', 'Opposto', 'Centro', 'Banda', 'Libero'];
    divRuoli.innerHTML = ruoliFissi.map(r => {
        const quanti = conteggioRuoli[r] || 0;
        return `
            <div class="bg-indigo-600 dark:bg-indigo-700 p-2.5 rounded-xl flex justify-between items-center border border-indigo-500/50 shadow-sm">
                <span class="text-xs text-indigo-100 font-medium">${r}</span>
                <span class="font-bold text-base text-white">${quanti}</span>
            </div>
        `;
    }).join('');

    let mappaContainerDettaglio = document.getElementById('mappaDettaglioContainer');
    if (!mappaContainerDettaglio) {
        mappaContainerDettaglio = document.createElement('div');
        mappaContainerDettaglio.id = 'mappaDettaglioContainer';
        container.appendChild(mappaContainerDettaglio);
    }

    if (matchInfo.indirizzo && matchInfo.indirizzo.trim() !== '') {
        const encodedAddress = encodeURIComponent(matchInfo.indirizzo);
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

        mappaContainerDettaglio.innerHTML = `
            <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-2 mt-4">
                <div class="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <svg class="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span class="truncate font-medium text-slate-700 dark:text-slate-200">${matchInfo.indirizzo}</span>
                </div>
                <a href="${googleMapsUrl}" target="_blank"
                   class="w-full bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-xs font-semibold py-2.5 px-3 rounded-xl flex items-center justify-center space-x-2 transition border border-indigo-100 dark:border-indigo-800/60">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
                    <span>Apri in Google Maps</span>
                </a>
            </div>
        `;
    } else {
        mappaContainerDettaglio.innerHTML = '';
    }
};

window.openPresenceModal = function (matchId, avversario) {
    if (!currentUser) return;
    activeMatchIdForPresence = matchId;
    document.getElementById('modalMatchTitle').textContent = `vs ${avversario}`;
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
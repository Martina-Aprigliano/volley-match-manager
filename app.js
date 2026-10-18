const SUPABASE_URL = 'https://ydklibjdzcwennwrblwi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2_PrY5UOPkEPJfucET16DA_i_zSx2Bx';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
});

const STORAGE_KEY = "volley_user_v1";
let currentUser = JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
let activeMatchIdForPresence = null;
let cachePartiteGlobali = [];
let mostraSoloArchivio = false;
let controlloScadenzaInCorso = false;

let salvataggioProfiloInCorso = false;
let salvataggioPartitaInCorso = false;
let salvataggioPresenzaInCorso = false;

const INDIRIZZO_CASA = "Oratorio Don Bosco Carugate, Via Papa Pio XI, 36, 20061 Carugate MI";

async function eseguiQueryConRetry(fnQuery, tentativi = 2) {
    for (let i = 0; i < tentativi; i++) {
        try {
            const res = await fnQuery();
            if (res && res.error && (res.error.message?.includes('Load failed') || res.error.message?.includes('Failed to fetch'))) {
                if (i < tentativi - 1) {
                    await new Promise(r => setTimeout(r, 400));
                    continue;
                }
            }
            return res;
        } catch (err) {
            if (i < tentativi - 1) {
                await new Promise(r => setTimeout(r, 400));
                continue;
            }
            return { data: null, error: err };
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    aggiornaInterfaccia();
    testaConnessioneGiocatrici();

    const matchForm = document.getElementById('matchForm');
    if (matchForm) {
        matchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (salvataggioPartitaInCorso) return;

            const id = document.getElementById('matchId').value;
            const avversario = document.getElementById('avversario').value.trim();
            const dataOra = document.getElementById('dataOra').value;
            const luogo = document.getElementById('luogo').value;
            const indirizzo = document.getElementById('indirizzo').value.trim();

            if (!avversario || !dataOra) {
                alert('Compila tutti i campi!');
                return;
            }

            salvataggioPartitaInCorso = true;
            const btnSubmit = document.getElementById('btnSalvaMatch');
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.textContent = 'Salvataggio...';
            }

            try {
                let res;
                if (id) {
                    res = await eseguiQueryConRetry(() => db.from('partite').update({ avversario, data_ora: dataOra, luogo, indirizzo }).eq('id', id));
                } else {
                    res = await eseguiQueryConRetry(() => db.from('partite').insert([{ avversario, data_ora: dataOra, luogo, indirizzo }]));
                }

                if (res && res.error) {
                    alert('Errore di rete durante il salvataggio. Riprova tra un istante.');
                } else {
                    matchForm.reset();
                    document.getElementById('matchId').value = '';
                    window.toggleMatchForm(false);
                    fetchMatches();
                }
            } finally {
                salvataggioPartitaInCorso = false;
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = 'Salva';
                }
            }
        });
    }
});

async function inserisciInfortunioStoricoSicuro(giocatriceId, dataInizio, dataFine) {
    if (!giocatriceId || !dataInizio || !dataFine) return;

    const { data: esistenti } = await eseguiQueryConRetry(() =>
        db.from('infortuni')
            .select('id')
            .eq('giocatrice_id', giocatriceId)
            .eq('data_inizio', dataInizio)
            .eq('data_fine', dataFine)
    );

    if (!esistenti || esistenti.length === 0) {
        await eseguiQueryConRetry(() =>
            db.from('infortuni').insert([{
                giocatrice_id: giocatriceId,
                data_inizio: dataInizio,
                data_fine: dataFine
            }])
        );
    }
}

async function controllaScadenzaInfortunio() {
    if (!currentUser || currentUser.isStaff || !currentUser.infortunata || controlloScadenzaInCorso) return;

    controlloScadenzaInCorso = true;
    try {
        if (currentUser.data_fine_infortunio) {
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);
            const dataFine = new Date(currentUser.data_fine_infortunio);
            dataFine.setHours(0, 0, 0, 0);

            if (oggi > dataFine) {
                const inizioDaArchiviare = currentUser.data_inizio_infortunio;
                const fineDaArchiviare = currentUser.data_fine_infortunio;

                currentUser.infortunata = false;
                currentUser.data_inizio_infortunio = null;
                currentUser.data_fine_infortunio = null;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));

                const datiReset = {
                    infortunata: false,
                    data_inizio_infortunio: null,
                    data_fine_infortunio: null
                };

                await eseguiQueryConRetry(() => db.from('giocatrici').update(datiReset).eq('id', currentUser.id));

                if (inizioDaArchiviare) {
                    await inserisciInfortunioStoricoSicuro(currentUser.id, inizioDaArchiviare, fineDaArchiviare);
                }
            }
        }
    } catch (err) {
        console.error("Errore controllo scadenza infortunio:", err);
    } finally {
        controlloScadenzaInCorso = false;
    }
}

window.applicaFormatoData = function (input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 8) v = v.slice(0, 8);

    if (v.length >= 5) {
        input.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
    } else if (v.length >= 3) {
        input.value = `${v.slice(0, 2)}/${v.slice(2)}`;
    } else {
        input.value = v;
    }
};

window.openProfileModal = function () {
    if (!currentUser) return;
    toggleSidebar(false);

    if (currentUser.isStaff) {
        document.getElementById('editStaffNomeCognome').value = `${currentUser.nome} ${currentUser.cognome}`;
        document.getElementById('editStaffRuolo').value = currentUser.ruolo || 'Allenatore';
        document.getElementById('editStaffAnno').value = currentUser.anno_nascita || '';
        document.getElementById('profileStaffModal').classList.remove('hidden');
    } else {
        document.getElementById('editProfileNomeCognome').value = `${currentUser.nome} ${currentUser.cognome}`;
        document.getElementById('editProfileRuolo').value = currentUser.ruolo || 'Palleggiatrice';
        document.getElementById('editProfileAnno').value = currentUser.anno_nascita || '';

        const toggle = document.getElementById('editInfortunioToggle');
        const dataInizio = document.getElementById('editDataInizio');
        const dataFine = document.getElementById('editDataFine');

        toggle.checked = !!currentUser.infortunata;
        dataInizio.value = currentUser.data_inizio_infortunio || '';
        dataFine.value = currentUser.data_fine_infortunio || '';

        toggleInfortunioFields(toggle.checked);

        document.getElementById('profileModal').classList.remove('hidden');
    }
};

window.closeProfileModal = function () {
    document.getElementById('profileModal').classList.add('hidden');
};

window.closeProfileStaffModal = function () {
    document.getElementById('profileStaffModal').classList.add('hidden');
};

window.toggleInfortunioFields = function (attivo) {
    const container = document.getElementById('containerDateInfortunio');
    const dataInizio = document.getElementById('editDataInizio');

    if (attivo) {
        container.classList.remove('opacity-40', 'pointer-events-none');
        if (!dataInizio.value) {
            const oggi = new Date();
            const gg = String(oggi.getDate()).padStart(2, '0');
            const mm = String(oggi.getMonth() + 1).padStart(2, '0');
            const aaaa = oggi.getFullYear();
            dataInizio.value = `${gg}/${mm}/${aaaa}`;
        }
    } else {
        container.classList.add('opacity-40', 'pointer-events-none');
    }
};

window.gestisciCambioToggleInfortunio = function (nuovoStato) {
    const eraInfortunata = currentUser && currentUser.infortunata;

    if (eraInfortunata && !nuovoStato) {
        const testoModale = document.getElementById('confirmRientroText');
        const dataFineInserita = document.getElementById('editDataFine').value || currentUser.data_fine_infortunio;

        if (testoModale) {
            if (dataFineInserita) {
                testoModale.textContent = `Confermi di rientrare prima della data inserita (${dataFineInserita})? Verrà aggiornata la data inserendo quella di oggi e salvata nello storico.`;
            } else {
                testoModale.textContent = `Confermi di rientrare? Verrà inserita in automatico la data di oggi e l'infortunio verrà salvato nello storico.`;
            }
        }
        document.getElementById('confirmRientroModal').classList.remove('hidden');
    } else {
        toggleInfortunioFields(nuovoStato);
    }
};

window.confermaRientro = function (confermato) {
    const toggle = document.getElementById('editInfortunioToggle');
    const dataFineInput = document.getElementById('editDataFine');
    const oggi = new Date();
    const oggiFormatted = `${String(oggi.getDate()).padStart(2, '0')}/${String(oggi.getMonth() + 1).padStart(2, '0')}/${oggi.getFullYear()}`;

    if (confermato) {
        toggle.checked = false;
        dataFineInput.value = oggiFormatted;
        toggleInfortunioFields(false);
    } else {
        toggle.checked = true;
        toggleInfortunioFields(true);
    }
    document.getElementById('confirmRientroModal').classList.add('hidden');
};

window.salvaProfilo = async function () {
    if (!currentUser || currentUser.isStaff || salvataggioProfiloInCorso) return;

    const nuovoRuolo = document.getElementById('editProfileRuolo').value;
    const nuovoAnno = document.getElementById('editProfileAnno').value.trim();
    const toggleInfortunio = document.getElementById('editInfortunioToggle');
    const infortunata = toggleInfortunio ? toggleInfortunio.checked : false;
    const dataInizioVal = document.getElementById('editDataInizio').value.trim();
    const dataFineVal = document.getElementById('editDataFine').value.trim();

    if (infortunata && !dataInizioVal) {
        alert("Inserisci la data di inizio infortunio!");
        return;
    }

    salvataggioProfiloInCorso = true;
    const btnSalva = document.getElementById('btnSalvaProfilo');
    if (btnSalva) {
        btnSalva.disabled = true;
        btnSalva.textContent = 'Salvataggio in corso...';
    }

    try {
        const eraInfortunata = currentUser.infortunata;

        if (eraInfortunata && !infortunata) {
            const dataInizioStorico = currentUser.data_inizio_infortunio || dataInizioVal || "N/D";
            const dataFineStorico = dataFineVal !== "" ? dataFineVal : new Date().toLocaleDateString('it-IT');
            await inserisciInfortunioStoricoSicuro(currentUser.id, dataInizioStorico, dataFineStorico);
        }

        const datiAggiornati = {
            ruolo: nuovoRuolo,
            anno_nascita: nuovoAnno !== "" ? nuovoAnno : null,
            infortunata: Boolean(infortunata),
            data_inizio_infortunio: infortunata ? (dataInizioVal || new Date().toLocaleDateString('it-IT')) : null,
            data_fine_infortunio: (infortunata && dataFineVal !== "") ? dataFineVal : null
        };

        const { data, error } = await db
            .from('giocatrici')
            .update(datiAggiornati)
            .eq('id', currentUser.id)
            .select();

        if (error) {
            alert('Errore di salvataggio su Supabase: ' + error.message);
        } else {
            if (data && data.length > 0) {
                currentUser = data[0];
            } else {
                currentUser.ruolo = nuovoRuolo;
                currentUser.anno_nascita = datiAggiornati.anno_nascita;
                currentUser.infortunata = datiAggiornati.infortunata;
                currentUser.data_inizio_infortunio = datiAggiornati.data_inizio_infortunio;
                currentUser.data_fine_infortunio = datiAggiornati.data_fine_infortunio;
            }

            currentUser.isStaff = false;
            currentUser.infortunata = Boolean(currentUser.infortunata);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
            closeProfileModal();
            aggiornaInterfaccia();
        }
    } finally {
        salvataggioProfiloInCorso = false;
        if (btnSalva) {
            btnSalva.disabled = false;
            btnSalva.textContent = 'Salva Modifiche';
        }
    }
};

window.salvaProfiloStaff = async function () {
    if (!currentUser || !currentUser.isStaff || salvataggioProfiloInCorso) return;

    const nuovoRuolo = document.getElementById('editStaffRuolo').value;
    const nuovoAnno = document.getElementById('editStaffAnno').value.trim();

    salvataggioProfiloInCorso = true;
    const btnSalva = document.getElementById('btnSalvaProfiloStaff');
    if (btnSalva) {
        btnSalva.disabled = true;
        btnSalva.textContent = 'Salvataggio...';
    }

    try {
        const datiAggiornati = {
            ruolo_staff: nuovoRuolo,
            anno_nascita: nuovoAnno !== "" ? nuovoAnno : null
        };

        const { data, error } = await eseguiQueryConRetry(() =>
            db.from('staff').update(datiAggiornati).eq('id', currentUser.id).select()
        );

        if (error) {
            console.error("Errore salvataggio staff Supabase:", error);
            alert('Connessione instabile o errore nel salvataggio. Riprova.');
        } else {
            if (data && data.length > 0) {
                currentUser.ruolo = data[0].ruolo_staff;
                currentUser.anno_nascita = data[0].anno_nascita;
            } else {
                currentUser.ruolo = nuovoRuolo;
                currentUser.anno_nascita = datiAggiornati.anno_nascita;
            }

            currentUser.isStaff = true;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
            closeProfileStaffModal();
            aggiornaInterfaccia();
        }
    } finally {
        salvataggioProfiloInCorso = false;
        if (btnSalva) {
            btnSalva.disabled = false;
            btnSalva.textContent = 'Salva Modifiche';
        }
    }
};

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

window.toggleTheme = function () {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('volley_theme', isDark ? 'dark' : 'light');
};

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
    const secInfortuni = document.getElementById('section-infortuni');

    rimuoviFiltriArchivio();

    secCalendario.classList.add('hidden');
    secRiepilogo.classList.add('hidden');
    secInfortuni.classList.add('hidden');

    if (sezione === 'calendario') {
        mostraSoloArchivio = false;
        const headerTitle = document.getElementById('sectionHeaderTitle');
        if (headerTitle) headerTitle.innerText = "Calendario Partite";
        const addBtn = document.querySelector('button[onclick="toggleMatchForm()"]');
        if (addBtn) addBtn.style.display = 'flex';

        secCalendario.classList.remove('hidden');
        renderMatches();
    } else if (sezione === 'riepilogo') {
        secRiepilogo.classList.remove('hidden');
        ripristinaSelectRiepilogoStruttura();
        popolaSelectRiepilogo();
    } else if (sezione === 'infortuni') {
        secInfortuni.classList.remove('hidden');
        if (currentUser && currentUser.isStaff) {
            caricaStoricoInfortuniStaff();
        } else {
            caricaStoricoInfortuni();
        }
    }
};

window.toggleAccordionInfortuniInCorso = function () {
    const content = document.getElementById('contentInfortuniInCorso');
    const arrow = document.getElementById('arrowInfortuniInCorso');
    if (content && arrow) {
        content.classList.toggle('hidden');
        arrow.classList.toggle('rotate-180');
    }
};

window.toggleAccordionGiocatriceStaff = function (giocatriceId) {
    const tuttiContenuti = document.querySelectorAll('[id^="storico_giocatrice_"]');
    const tutteFrecce = document.querySelectorAll('[id^="arrow_giocatrice_"]');

    tuttiContenuti.forEach(el => {
        if (el.id !== `storico_giocatrice_${giocatriceId}`) {
            el.classList.add('hidden');
        }
    });

    tutteFrecce.forEach(el => {
        if (el.id !== `arrow_giocatrice_${giocatriceId}`) {
            el.classList.remove('rotate-180');
        }
    });

    const content = document.getElementById(`storico_giocatrice_${giocatriceId}`);
    const arrow = document.getElementById(`arrow_giocatrice_${giocatriceId}`);
    if (content && arrow) {
        content.classList.toggle('hidden');
        arrow.classList.toggle('rotate-180');
    }
};

async function caricaStoricoInfortuniStaff() {
    const boxWrapper = document.getElementById('boxInfortuniInCorsoWrapper');
    const contentInCorso = document.getElementById('contentInfortuniInCorso');
    const countBadge = document.getElementById('countInfortuniInCorso');
    const listaGiocatriciContainer = document.getElementById('listaGiocatriciStoricoStaff');
    const listaStoricoClassico = document.getElementById('listaStoricoInfortuni');

    if (listaStoricoClassico) listaStoricoClassico.innerHTML = '';
    if (!boxWrapper || !listaGiocatriciContainer) return;

    listaGiocatriciContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Caricamento dati infortuni...</p>';

    const { data: giocatrici, error: errG } = await eseguiQueryConRetry(() => db.from('giocatrici').select('*').order('nome', { ascending: true }));
    const { data: infortuniStorico, error: errI } = await eseguiQueryConRetry(() => db.from('infortuni').select('*').order('data_inizio', { ascending: false }));

    if (errG || errI) {
        listaGiocatriciContainer.innerHTML = '<p class="text-xs text-rose-500 text-center py-4">Errore nel caricamento dei dati.</p>';
        return;
    }

    const infortunateInCorso = giocatrici.filter(g => g.infortunata && g.data_inizio_infortunio);

    if (infortunateInCorso.length > 0) {
        boxWrapper.classList.remove('hidden');
        if (countBadge) countBadge.textContent = infortunateInCorso.length;

        contentInCorso.innerHTML = infortunateInCorso.map(g => {
            const dInizio = g.data_inizio_infortunio;
            const dFine = g.data_fine_infortunio ? `fino al ${g.data_fine_infortunio}` : 'in corso';
            return `
                <div class="bg-white dark:bg-slate-900/80 p-3 rounded-xl border border-amber-200/80 dark:border-amber-900/50 flex justify-between items-center text-xs">
                    <div>
                        <span class="font-bold text-slate-900 dark:text-white text-sm">${g.nome} ${g.cognome}</span>
                        <p class="text-slate-500 dark:text-slate-400 mt-0.5">Dal ${dInizio} (${dFine})</p>
                    </div>
                    <span class="bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 px-2 py-1 rounded-md font-semibold">${g.ruolo || 'Ruolo'}</span>
                </div>
            `;
        }).join('');
    } else {
        boxWrapper.classList.add('hidden');
    }

    if (giocatrici.length === 0) {
        listaGiocatriciContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Nessuna giocatrice trovata.</p>';
        return;
    }

    listaGiocatriciContainer.innerHTML = giocatrici.map(g => {
        const storicoG = infortuniStorico ? infortuniStorico.filter(inf => inf.giocatrice_id === g.id) : [];

        let htmlStoricoItem = '';
        if (storicoG.length > 0) {
            htmlStoricoItem = storicoG.map(inf => {
                return `
                    <div class="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 flex justify-between items-center text-xs">
                        <span class="text-slate-700 dark:text-slate-300">Dal <strong>${inf.data_inizio}</strong> al <strong>${inf.data_fine}</strong></span>
                        <span class="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-medium">Concluso</span>
                    </div>
                `;
            }).join('');
        } else {
            htmlStoricoItem = '<p class="text-xs text-slate-400 italic py-1">Nessun infortunio nello storico.</p>';
        }

        let htmlInfortunioAttivoCard = '';
        if (g.infortunata && g.data_inizio_infortunio) {
            htmlInfortunioAttivoCard = `
                <div class="bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50 text-xs flex justify-between items-center mb-2">
                    <span class="font-semibold text-amber-800 dark:text-amber-300">Infortunio Attivo dal ${g.data_inizio_infortunio}</span>
                    <span class="bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded font-bold">In corso</span>
                </div>
            `;
        }

        return `
            <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                <button type="button" onclick="toggleAccordionGiocatriceStaff('${g.id}')"
                    class="w-full p-3.5 text-left flex justify-between items-center cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <div class="flex items-center space-x-3">
                        <div class="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0">
                            ${g.nome.charAt(0)}${g.cognome.charAt(0)}
                        </div>
                        <div>
                            <span class="font-bold text-slate-800 dark:text-white text-sm">${g.nome} ${g.cognome}</span>
                            <p class="text-xs text-slate-500 dark:text-slate-400">${g.ruolo || 'Ruolo non specificato'}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        ${g.infortunata ? '<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>' : ''}
                        <svg id="arrow_giocatrice_${g.id}" class="w-4 h-4 text-slate-400 transform transition-transform duration-200" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </div>
                </button>
                <div id="storico_giocatrice_${g.id}" class="hidden p-3.5 pt-0 space-y-2 border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/30">
                    <div class="pt-2"></div>
                    ${htmlInfortunioAttivoCard}
                    <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Storico Infortuni Passati</p>
                    ${htmlStoricoItem}
                </div>
            </div>
        `;
    }).join('');
}

async function caricaStoricoInfortuni() {
    const container = document.getElementById('listaStoricoInfortuni');
    const boxWrapper = document.getElementById('boxInfortuniInCorsoWrapper');
    const listaGiocatriciContainer = document.getElementById('listaGiocatriciStoricoStaff');

    if (boxWrapper) boxWrapper.classList.add('hidden');
    if (listaGiocatriciContainer) listaGiocatriciContainer.innerHTML = '';

    if (!container || !currentUser || currentUser.isStaff) return;

    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Caricamento storico...</p>';

    await controllaScadenzaInfortunio();

    const { data, error } = await eseguiQueryConRetry(() =>
        db.from('infortuni')
            .select('*')
            .eq('giocatrice_id', currentUser.id)
            .order('data_inizio', { ascending: false })
    );

    if (error) {
        container.innerHTML = '<p class="text-xs text-rose-500 text-center py-4">Errore nel caricamento dello storico.</p>';
        return;
    }

    let htmlAttivo = '';
    if (currentUser.infortunata && currentUser.data_inizio_infortunio) {
        const dInizio = currentUser.data_inizio_infortunio;
        const testoFine = currentUser.data_fine_infortunio ? `fino al ${currentUser.data_fine_infortunio}` : 'ad oggi';

        htmlAttivo = `
            <div class="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 space-y-2">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Infortunio Attivo</span>
                    <span class="text-xs bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-md font-medium">In corso</span>
                </div>
                <p class="text-sm font-semibold text-slate-800 dark:text-white">Dal ${dInizio} ${testoFine}</p>
            </div>
        `;
    }

    let htmlStorico = '';
    if (data && data.length > 0) {
        htmlStorico = data.map(inf => {
            return `
                <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-2">
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Periodo di Stop</span>
                        <span class="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full font-medium">Concluso</span>
                    </div>
                    <p class="text-sm font-medium text-slate-700 dark:text-slate-200">Dal <strong class="text-slate-900 dark:text-white">${inf.data_inizio}</strong> al <strong class="text-slate-900 dark:text-white">${inf.data_fine}</strong></p>
                </div>
            `;
        }).join('');
    }

    if (!htmlAttivo && (!data || data.length === 0)) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Nessun infortunio registrato nello storico.</p>';
    } else {
        container.innerHTML = htmlAttivo + htmlStorico;
    }
}

window.showArchivedMatches = function () {
    toggleSidebar(false);
    mostraSoloArchivio = true;

    const secCalendario = document.getElementById('section-calendario');
    const secRiepilogo = document.getElementById('section-riepilogo');
    const secInfortuni = document.getElementById('section-infortuni');

    secCalendario.classList.remove('hidden');
    secRiepilogo.classList.add('hidden');
    secInfortuni.classList.add('hidden');

    const headerTitle = document.getElementById('sectionHeaderTitle');
    if (headerTitle) headerTitle.innerText = "Archivio Partite Passate";

    const addBtn = document.querySelector('button[onclick="toggleMatchForm()"]');
    if (addBtn) addBtn.style.display = 'none';

    renderFiltriArchivio();
    renderMatches();
};

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
    const { error } = await eseguiQueryConRetry(() => db.from('giocatrici').select('id').limit(1));
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
        const { data: staffData, error: staffError } = await eseguiQueryConRetry(() =>
            db.from('staff')
                .select('*')
                .ilike('nome', nomeVal)
                .ilike('cognome', cognomeVal)
        );

        if (!staffError && staffData && staffData.length > 0) {
            currentUser = {
                id: staffData[0].id,
                nome: staffData[0].nome,
                cognome: staffData[0].cognome,
                ruolo: staffData[0].ruolo_staff || staffData[0].ruolo,
                anno_nascita: staffData[0].anno_nascita,
                isStaff: true
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
            aggiornaInterfaccia();
            return;
        }

        const { data, error } = await eseguiQueryConRetry(() =>
            db.from('giocatrici')
                .select('*')
                .ilike('nome', nomeVal)
                .ilike('cognome', cognomeVal)
        );

        if (error || !data || data.length === 0) {
            alert('Utente non trovato nel database della squadra o dello staff.');
            return;
        }

        currentUser = data[0];
        currentUser.isStaff = false;
        currentUser.infortunata = !!currentUser.infortunata;

        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));

        await controllaScadenzaInfortunio();

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

        const dispName = document.getElementById('currentUserDisplay');
        const dispRole = document.getElementById('currentUserRole');
        if (dispName) dispName.textContent = `${currentUser.nome} ${currentUser.cognome}`;
        if (dispRole) dispRole.textContent = currentUser.ruolo;

        const sidebarName = document.getElementById('sidebarProfileName');
        const sidebarRoleYear = document.getElementById('sidebarProfileRoleYear');
        const sidebarInitials = document.getElementById('sidebarAvatarInitials');

        if (sidebarName) sidebarName.textContent = `${currentUser.nome} ${currentUser.cognome}`;
        if (sidebarRoleYear) {
            sidebarRoleYear.textContent = currentUser.isStaff
                ? (currentUser.anno_nascita ? `${currentUser.ruolo || 'Ruolo'} • ${currentUser.anno_nascita}` : `${currentUser.ruolo || 'Ruolo'}`)
                : (currentUser.anno_nascita ? `${currentUser.ruolo || 'Ruolo'} • ${currentUser.anno_nascita}` : `${currentUser.ruolo || 'Ruolo'}`);
        }
        if (sidebarInitials) {
            const iniziali = `${currentUser.nome.charAt(0)}${currentUser.cognome.charAt(0)}`.toUpperCase();
            sidebarInitials.textContent = iniziali;
        }

        const btnInfortuniMenu = document.querySelector('button[onclick="mostraSezione(\'infortuni\')"]');
        if (btnInfortuniMenu) {
            btnInfortuniMenu.style.display = 'flex';
        }

        const btnMenuRiepilogo = document.getElementById('btnMenuRiepilogo');
        if (btnMenuRiepilogo) {
            btnMenuRiepilogo.style.display = currentUser.isStaff ? 'none' : 'flex';
        }

        const secInfortuni = document.getElementById('section-infortuni');
        if (secInfortuni && !secInfortuni.classList.contains('hidden')) {
            if (currentUser.isStaff) {
                caricaStoricoInfortuniStaff();
            } else {
                caricaStoricoInfortuni();
            }
        }

        fetchMatches();
    }
}

function isGiocatriceInfortunataPerPartita(matchDateStr, giocatrice) {
    let target = giocatrice;
    if (currentUser && !currentUser.isStaff && target && target.id === currentUser.id) {
        target = currentUser;
    }

    if (!target || !target.infortunata || !target.data_inizio_infortunio) return false;

    const matchDate = new Date(matchDateStr);
    const dataInizio = new Date(target.data_inizio_infortunio);

    matchDate.setHours(0, 0, 0, 0);
    dataInizio.setHours(0, 0, 0, 0);

    if (matchDate < dataInizio) return false;

    if (target.data_fine_infortunio) {
        const dataFine = new Date(target.data_fine_infortunio);
        dataFine.setHours(23, 59, 59, 999);
        if (matchDate > dataFine) return false;
    }

    return true;
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
        const { error } = await eseguiQueryConRetry(() => db.from('partite').delete().eq('id', id));
        if (!error) fetchMatches();
    }
};

async function fetchMatches() {
    if (currentUser && !currentUser.isStaff) {
        await controllaScadenzaInfortunio();
    }

    const { data, error } = await eseguiQueryConRetry(() =>
        db.from('partite')
            .select(`*, presenze(giocatrice_id, presente)`)
            .order('data_ora', { ascending: true })
    );

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

    let badgeStatus = '';

    if (!currentUser || !currentUser.isStaff) {
        const isInfortunataMatch = isGiocatriceInfortunataPerPartita(match.data_ora, currentUser);

        if (isInfortunataMatch) {
            badgeStatus = '<span class="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full font-medium">Infortunata</span>';
        } else {
            let miaPresenza = null;
            if (currentUser && match.presenze) {
                const p = match.presenze.find(x => x.giocatrice_id === currentUser.id);
                if (p) miaPresenza = p.presente;
            }

            badgeStatus = '<span class="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full font-medium">Non risposto</span>';
            if (miaPresenza === true) badgeStatus = '<span class="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full font-medium">Ci sono</span>';
            if (miaPresenza === false) badgeStatus = '<span class="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-full font-medium">Assente</span>';
        }
    }

    const card = document.createElement('div');

    if (isInEvidenza) {
        card.className = "bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-md border-2 border-indigo-500 flex flex-col space-y-3 transition-colors";
    } else if (isArchivio) {
        card.className = "bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col space-y-3 transition-colors cursor-pointer hover:border-indigo-500";
    } else {
        card.className = "bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col space-y-3 transition-colors";
    }

    const clickAction = isArchivio || (currentUser && currentUser.isStaff)
        ? `apriDettaglioStaff('${match.id}')`
        : `openPresenceModal('${match.id}', '${match.avversario.replace(/'/g, "\\'")}')`;

    let mappaHtml = '';
    // Mostra la mappa SOLO se la partita NON è nell'archivio
    if (!isArchivio && match.indirizzo && match.indirizzo.trim() !== '') {
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
                ${!isArchivio && currentUser && !currentUser.isStaff ? `<div class="mt-2">${badgeStatus}</div>` : ''}
            </div>
            <div class="flex space-x-1 items-center">
                ${!isArchivio && currentUser ? `
                <button type="button" onclick='editMatch(${JSON.stringify(match).replace(/'/g, "&#39;")})' class="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer" title="Modifica">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                ${currentUser.isStaff ? `
                <button type="button" onclick="deleteMatch('${match.id}')" class="p-2 text-slate-400 hover:text-rose-500 transition cursor-pointer" title="Elimina">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>` : ''}
                ` : ''}
            </div>
        </div>
        ${mappaHtml}
    `;

    return card;
}

window.ripristinaSelectRiepilogoStruttura = function () {
    const container = document.getElementById('section-riepilogo');
    const boxCard = container.querySelector('.bg-white, .dark\\:bg-slate-800');
    if (boxCard) {
        boxCard.innerHTML = `
            <div class="mb-3">
                <button type="button" onclick="mostraSezione('calendario')"
                    class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-1 cursor-pointer">
                    <span>← Torna al Calendario</span>
                </button>
            </div>
            <h2 class="font-bold text-slate-800 dark:text-white text-base">Seleziona Partita</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">Scegli la partita per visualizzare i convocati e il conteggio dei ruoli.</p>
            <select id="selectPartitaRiepilogo" onchange="caricaDettaglioPartita(this.value)"
                class="w-full p-3 mt-2 border dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white">
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

// --- APERTURA DETTAGLIO DAL CALENDARIO O ARCHIVIO ---
window.apriDettaglioStaff = function (matchId) {
    mostraSezione('riepilogo');
    const matchInfo = cachePartiteGlobali.find(m => m.id === matchId);
    if (!matchInfo) return;

    const adesso = new Date();
    const èPassata = new Date(matchInfo.data_ora) < adesso;

    const containerSezioneRiepilogo = document.getElementById('section-riepilogo');
    const boxCard = containerSezioneRiepilogo.querySelector('.bg-white, .dark\\:bg-slate-800');

    if (boxCard) {
        const dataFormatted = new Date(matchInfo.data_ora).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

        if (èPassata) {
            boxCard.innerHTML = `
                <div class="mb-3">
                    <button type="button" onclick="showArchivedMatches()"
                        class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-1 cursor-pointer">
                        <span>← Torna alle partite archiviate</span>
                    </button>
                </div>
                <h2 class="font-bold text-slate-800 dark:text-white text-base">Partita Archiviata</h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">Resoconto storico della partita selezionata.</p>
                <div class="w-full p-3 mt-2 bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 flex justify-between items-center cursor-default">
                    <span>vs ${matchInfo.avversario} (${dataFormatted})</span>
                    <span class="text-xs bg-slate-200 dark:bg-slate-600 px-2.5 py-1 rounded text-slate-500 dark:text-slate-300">Archiviata</span>
                </div>
            `;
        } else {
            ripristinaSelectRiepilogoStruttura();
            const selectPartita = document.getElementById('selectPartitaRiepilogo');
            if (selectPartita) {
                selectPartita.value = matchId;
            }
        }
    }

    caricaDettaglioPartita(matchId, èPassata);
};

// --- CARICAMENTO DETTAGLIO PARTITA (CON CONTROLLO ARCHIVIO) ---
window.caricaDettaglioPartita = async function (matchId, forzaArchivio = false) {
    const container = document.getElementById('dettaglioPartitaContainer');
    const titolo = document.getElementById('dettaglioTitoloMatch');
    const divPresenti = document.getElementById('listaPresentiDettaglio');
    const divInfortunate = document.getElementById('listaInfortunateDettaglio');
    const divAssenti = document.getElementById('listaAssentiDettaglio');
    const divRuoli = document.getElementById('conteggioRuoliDettaglio');
    const sezioneInfortunateWrapper = document.getElementById('sezioneInfortunateDettaglioWrapper');

    if (!matchId) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    divPresenti.innerHTML = '<p class="text-xs text-slate-400">Caricamento...</p>';
    if (divInfortunate) divInfortunate.innerHTML = '<p class="text-xs text-slate-400">Caricamento...</p>';
    divAssenti.innerHTML = '<p class="text-xs text-slate-400">Caricamento...</p>';
    divRuoli.innerHTML = '';

    const { data: giocatrici, error: errG } = await eseguiQueryConRetry(() => db.from('giocatrici').select('*'));
    const { data: presenze, error: errP } = await eseguiQueryConRetry(() => db.from('presenze').select('*').eq('match_id', matchId));

    const matchInfo = cachePartiteGlobali.find(m => m.id === matchId);

    if (errG || errP || !matchInfo) {
        divPresenti.innerHTML = '<p class="text-xs text-rose-500">Errore nel caricamento dei dati.</p>';
        return;
    }

    const adesso = new Date();
    const èPartitaPassata = forzaArchivio || (new Date(matchInfo.data_ora) < adesso);

    titolo.textContent = `Partita vs ${matchInfo.avversario}`;

    let presentiList = [];
    let infortunateList = [];
    let assentiList = [];
    let nonHannoRispostoList = [];
    let conteggioRuoli = {};

    giocatrici.forEach(g => {
        let giocatriceDaControllare = g;
        if (currentUser && !currentUser.isStaff && g.id === currentUser.id) {
            giocatriceDaControllare = currentUser;
        }

        if (isGiocatriceInfortunataPerPartita(matchInfo.data_ora, giocatriceDaControllare)) {
            infortunateList.push(giocatriceDaControllare);
        } else {
            const registro = presenze.find(p => p.giocatrice_id === g.id);
            if (registro && registro.presente === true) {
                presentiList.push(g);
                conteggioRuoli[g.ruolo] = (conteggioRuoli[g.ruolo] || 0) + 1;
            } else if (registro && registro.presente === false) {
                assentiList.push(g);
            } else {
                nonHannoRispostoList.push(g);
            }
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

    if (sezioneInfortunateWrapper && divInfortunate) {
        if (infortunateList.length === 0) {
            sezioneInfortunateWrapper.style.display = 'none';
        } else {
            sezioneInfortunateWrapper.style.display = 'block';
            divInfortunate.innerHTML = infortunateList.map(g => `
                <div class="flex justify-between items-center bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-xl border border-amber-100 dark:border-amber-900/40">
                    <span class="font-semibold text-slate-700 dark:text-slate-200">${g.nome} ${g.cognome}</span>
                    <span class="text-xs bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-md font-medium">Infortunata</span>
                </div>
            `).join('');
        }
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

    let divContainerNR = document.getElementById('containerNonRispostoDettaglio');
    if (!divContainerNR) {
        const cardDettaglio = divAssenti.parentElement.parentElement;
        divContainerNR = document.createElement('div');
        divContainerNR.id = 'containerNonRispostoDettaglio';
        divContainerNR.className = "border-t dark:border-slate-700 pt-3 mt-3 space-y-3";
        cardDettaglio.appendChild(divContainerNR);
    }

    if (currentUser && currentUser.isStaff && !èPartitaPassata) {
        divContainerNR.style.display = 'block';
        divContainerNR.innerHTML = `
            <h4 class="text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase">Non hanno risposto</h4>
            <div id="listaNonRispostoDettaglio" class="space-y-1.5 text-sm">
                ${nonHannoRispostoList.length ? nonHannoRispostoList.map(g => `
                    <div class="flex justify-between items-center bg-slate-100 dark:bg-slate-700/50 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600">
                        <span class="font-semibold text-slate-700 dark:text-slate-200">${g.nome}${g.cognome}</span>
                        <span class="text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md font-medium">${g.ruolo}</span>
                    </div>
                `).join('') : '<p class="text-xs text-slate-400 italic">Tutte le giocatrici hanno risposto!</p>'}
            </div>
            <div id="containerBottoneSollecita">
                ${nonHannoRispostoList.length > 0 ? `
                    <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(`Ciao ragazze! Vi ricordo di inserire la vostra disponibilità per la partita vs ${matchInfo.avversario}.\n\nMancano le risposte di:\n${nonHannoRispostoList.map(g => `- ${g.nome}${g.cognome}`).join('\n')}\n\nGrazie! 🏐`)}" target="_blank"
                       class="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition shadow-sm cursor-pointer mt-3">
                        <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                        <span>Sollecita risposta</span>
                    </a>
                ` : ''}
            </div>
        `;
    } else {
        divContainerNR.style.display = 'none';
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
    if (!currentUser || currentUser.isStaff) return;

    const match = cachePartiteGlobali.find(m => m.id === matchId);
    if (match && isGiocatriceInfortunataPerPartita(match.data_ora, currentUser)) {
        alert("Risulti infortunata per questa partita, non è possibile modificare la presenza.");
        return;
    }

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
    if (!currentUser || currentUser.isStaff || !activeMatchIdForPresence || salvataggioPresenzaInCorso) return;

    salvataggioPresenzaInCorso = true;
    try {
        const { error } = await eseguiQueryConRetry(() =>
            db.from('presenze').upsert({
                match_id: activeMatchIdForPresence,
                giocatrice_id: currentUser.id,
                presente: presente
            }, { onConflict: 'match_id,giocatrice_id' })
        );

        if (error) {
            alert('Connessione instabile, impossibile salvare la presenza. Riprova.');
        } else {
            window.closePresenceModal();
            fetchMatches();
        }
    } finally {
        salvataggioPresenzaInCorso = false;
    }
};

window.closeProfileStaffModal = function () {
    const modal = document.getElementById('profileStaffModal');
    if (modal) modal.classList.add('hidden');
};

window.salvaProfiloStaff = async function () {
    if (!currentUser || !currentUser.isStaff || salvataggioProfiloInCorso) return;

    const nuovoRuolo = document.getElementById('editStaffRuolo').value;
    const nuovoAnno = document.getElementById('editStaffAnno').value.trim();

    salvataggioProfiloInCorso = true;
    const btnSalva = document.getElementById('btnSalvaProfiloStaff');
    if (btnSalva) {
        btnSalva.disabled = true;
        btnSalva.textContent = 'Salvataggio...';
    }

    try {
        const dataAggiornati = {
            ruolo_staff: nuovoRuolo,
            anno_nascita: nuovoAnno !== "" ? nuovoAnno : null
        };

        const { data, error } = await eseguiQueryConRetry(() =>
            db.from('staff').update(dataAggiornati).eq('id', currentUser.id).select()
        );

        if (error) {
            console.error("Errore salvataggio staff Supabase:", error);
            alert('Connessione instabile o errore nel salvataggio. Riprova.');
        } else {
            if (data && data.length > 0) {
                currentUser.ruolo = data[0].ruolo_staff;
                currentUser.anno_nascita = data[0].anno_nascita;
            } else {
                currentUser.ruolo = nuovoRuolo;
                currentUser.anno_nascita = dataAggiornati.anno_nascita;
            }

            currentUser.isStaff = true;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
            closeProfileStaffModal();
            aggiornaInterfaccia();
        }
    } finally {
        salvataggioProfiloInCorso = false;
        if (btnSalva) {
            btnSalva.disabled = false;
            btnSalva.textContent = 'Salva Modifiche';
        }
    }
};
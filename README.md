# StudyBoard

App per pianificare lo studio. Si installa su **Windows, Linux e iPhone** come PWA (webapp installabile) e funziona anche offline.

**App online: https://aldetor00.github.io/studyboard/**

Cosa contiene:
- **Oggi**: countdown al prossimo esame, timer delle sessioni di studio, piano del giorno, prossime scadenze e avanzamento per materia
- **Piano**: attività con checkbox, priorità e scadenza, viste **per materia** oppure **per giorno** (i prossimi 7 giorni). Con 📅 scegli in che giorno fare un'attività (su PC puoi anche trascinarla), con ☀ la metti nel "piano di oggi". Le attività non completate restano nel piano di oggi finché non le fai
- **Piano di oggi**: oltre a scrivere nuove attività, con **Importa dal piano** scegli quelle che hai già nel Piano
- **Calendario**: vista mensile con esami, consegne e altre scadenze
- **Materie**: scegli una materia e trovi tutto in un posto: attività, scadenze, materiali, note, ore di studio, voto nel libretto, e i pulsanti "Studia ora" e "Chiedi all'assistente"
- **Libretto**: esami sostenuti con voto (anche 30 e lode e idoneità) e CFU. Calcola media ponderata, media aritmetica, base di laurea su 110 e CFU mancanti, mostra il grafico dei voti e ha un simulatore ("che media avrei con un 28 da 9 CFU?")
- **Statistiche**: ore studiate per giorno e per materia, streak di giorni consecutivi, mappa della costanza e sessioni recenti
- **Materiali**: carichi dispense, appunti, slide e immagini divisi per materia, e li apri da qualsiasi dispositivo
- **Assistente**: fai domande veloci all'intelligenza artificiale, Google Gemini con il piano gratuito ("cosa studio oggi?", "riorganizza il piano di Analisi"). Conosce le tue materie, attività e scadenze, legge i materiali che alleghi e propone modifiche al piano che applichi con un tocco
- **Note**: appunti rapidi che si salvano da soli mentre scrivi
- **Impostazioni**: materie, backup (esporta/importa), installazione e account

Il **timer** si avvia con *Inizia a studiare* e si gestisce con *Pausa*, *Riprendi* e *Termina*. Le ore vengono calcolate in automatico, escluse le pause. Il timer continua a contare anche se chiudi l'app, e lo vedi su tutti i dispositivi.

---

## 1. Provarla subito sul PC (modalità locale)

Senza configurare niente, l'app salva i dati solo nel browser di questo PC.

```bash
python -m http.server 8080
```

Poi apri http://localhost:8080. Il doppio clic su `index.html` funziona, ma senza offline e senza installazione: usa il server.

---

## 2. Configurare Supabase (sincronizzazione tra dispositivi)

1. Crea un account gratuito su https://supabase.com e poi un **New project** (scegli la region *Central EU*).
2. Nel progetto apri **SQL Editor**, poi **New query**. Incolla tutto il contenuto di [`supabase/schema.sql`](supabase/schema.sql) e premi **Run**.
3. Vai in **Authentication → Sign In / Providers → Email**:
   - lascia attivo *Email*;
   - se vuoi evitare l'email di conferma al primo accesso, disattiva **Confirm email**. Con la conferma attiva, ricevi una mail con un link: cliccalo e poi accedi dall'app.
4. Vai in **Project Settings → API** e copia **Project URL** e la chiave **anon public**.
5. Incolla i due valori in [`config.js`](config.js):
   ```js
   window.STUDYBOARD_CONFIG = {
     supabaseUrl: "https://xxxxxxxx.supabase.co",
     supabaseAnonKey: "eyJhbGciOi...",
   };
   ```
6. Ricarica l'app, premi **Crea account** (email + password) e poi **Accedi**.

> Se avevi già inserito dati in modalità locale, al primo accesso vengono caricati sul tuo account, compresi i file dei Materiali.
>
> **Hai già eseguito lo schema in passato?** Rieseguilo per intero: si può lanciare più volte senza perdere dati e aggiunge lo spazio per i Materiali.
>
> **Usi l'app solo tu?** Dopo aver creato il tuo account, in **Authentication → Sign In / Providers** disattiva **Allow new users to sign up**. Se invece vuoi condividerla con amici, lascia aperte le iscrizioni e leggi la sezione 6.
>
> La chiave *anon* può stare nel codice pubblico: i dati sono protetti dalle regole di sicurezza (Row Level Security) dello schema. Ogni utente vede solo i propri dati. **Non** usare mai la chiave `service_role`.

---

## 2b. Attivare l'assistente (Gemini, gratis)

L'assistente usa l'**API di Google Gemini con il piano gratuito**: non serve carta di credito. L'abbonamento Gemini per studenti non c'entra (vale per l'app Gemini, non per l'API), ma il piano gratuito dell'API basta.

**Ogni persona usa la propria chiave**, così le quote gratuite non si sommano e nessuno consuma quella degli altri. Non c'è niente da configurare su Supabase: le richieste partono direttamente dal browser verso Google.

1. Vai su https://aistudio.google.com/apikey, accedi con un account Google e premi **Create API key**. **Non** collegare un account di fatturazione: così resti sul piano gratuito e non puoi spendere nulla.
2. Nell'app apri **Assistente** (o *Impostazioni → Assistente*), premi **Inserisci la chiave** e incollala.
3. Fai una domanda.

La chiave viene salvata **solo nel browser di quel dispositivo**: non finisce sul server Supabase, quindi nemmeno il gestore dell'app può vederla. Per questo va inserita una volta su ogni dispositivo (PC, iPhone…).

**Cose da sapere sul piano gratuito**
- **Limiti di utilizzo**: c'è un numero massimo di richieste al minuto e al giorno. Google non li pubblica più in una tabella fissa: li vedi in AI Studio, alla pagina *Rate limit*. Se li superi, l'app ti avvisa con un messaggio. Il conteggio giornaliero si azzera ogni giorno alle 9 circa, ora italiana.
- **Privacy**: con il piano gratuito Google può usare domande e allegati per migliorare i suoi prodotti, e possono essere letti da revisori. Va benissimo per dispense e appunti; **non** allegare documenti con dati personali o riservati.
- **Modello**: quello predefinito è `gemini-flash-latest`, che punta sempre al Gemini Flash più recente. Se un giorno ricevi l'errore "modello non disponibile", in *Impostazioni → Assistente → Cambia* scrivi nel campo *Modello* un modello attuale preso dalla pagina prezzi di AI Studio, ad esempio un modello "flash" con il prezzo gratuito.

**Cosa legge l'assistente**: PDF, immagini (JPG, PNG, GIF, WebP, HEIC) e file di testo, fino a circa 18 MB in tutto per domanda. Word e PowerPoint non sono letti direttamente: esportali in PDF prima di caricarli.

**Come funzionano le modifiche**: quando chiedi di cambiare il piano, l'assistente le elenca come "Modifiche proposte". Non cambia nulla finché non premi **Applica** (o **Applica tutte**). Puoi aprire l'assistente anche dal ✨ accanto a una materia nel Piano, o accanto a un file nei Materiali.

Con **Nuova conversazione** riparti da zero: le risposte sono più veloci e consumi meno quota.

---

## 3. Pubblicarla online (necessario per l'iPhone)

Per installarla sull'iPhone l'app deve essere raggiungibile da un indirizzo `https://`. Il modo più semplice e gratuito è **GitHub Pages**:

1. Crea un account su https://github.com e un nuovo repository (es. `studyboard`). Può essere pubblico: la chiave anon non è segreta.
2. Carica tutti i file di questa cartella: dalla pagina del repository usa **Add file → Upload files** e trascina i file e le cartelle `icons` e `supabase`. In alternativa usa GitHub Desktop.
3. Nel repository apri **Settings → Pages**, alla voce *Source* scegli **Deploy from a branch**, poi il branch `main` e la cartella `/ (root)`, e salva.
4. Dopo circa un minuto l'app è online su `https://<tuo-utente>.github.io/studyboard/`.
5. In Supabase, in **Authentication → URL Configuration**, imposta quell'indirizzo come **Site URL**, così i link nelle email di conferma portano all'app.

### Aggiornare l'app dopo una modifica
Carica di nuovo i file modificati e, in [`sw.js`](sw.js), aumenta `VERSION` (es. `'v2'`), così i dispositivi scaricano la nuova versione.

---

## 4. Installarla

| Dispositivo | Come |
|---|---|
| **Windows** | Apri il sito con Edge o Chrome e clicca l'icona *Installa* nella barra degli indirizzi (oppure *Impostazioni → Installa l'app*). La trovi nel menu Start. |
| **Linux** | Chrome o Chromium: icona *Installa* nella barra degli indirizzi. La trovi tra le applicazioni. |
| **iPhone** | Apri il sito con **Safari**, tocca *Condividi* e poi **Aggiungi alla schermata Home**. Si apre a schermo intero come un'app. |

---

## 6. Condividere l'app con amici

Basta mandare l'indirizzo dell'app pubblicata (sezione 3): ognuno preme **Crea account** e ha il suo piano di studio, separato da quello degli altri. Le regole di sicurezza del database fanno sì che ogni account veda solo i propri dati e file.

Da sapere:
- **Email di conferma e recupero password**: il servizio email incluso in Supabase invia pochissime email all'ora. Con qualche amico che si iscrive insieme, il limite si raggiunge in fretta. Hai due soluzioni:
  - disattivare **Confirm email** in *Authentication → Sign In / Providers → Email*: ci si iscrive subito, senza email;
  - collegare un servizio email tuo in *Authentication → Emails → SMTP Settings* (ad esempio Resend o Brevo, che hanno piani gratuiti).
- **Link nelle email**: in *Authentication → URL Configuration* imposta come **Site URL** l'indirizzo dell'app pubblicata e aggiungilo anche tra i **Redirect URLs**, insieme a `http://localhost:8080`.
- **Spazio**: il piano gratuito di Supabase ha 500 MB di database e **1 GB per i file, in comune tra tutti gli utenti**. Per qualche amico va bene, ma meglio non caricare video o PDF enormi.
- **Assistente**: ognuno crea e inserisce la propria chiave gratuita di Gemini (sezione 2b), quindi ha la sua quota e non consuma quella degli altri.
- **Privacy**: come proprietario del progetto Supabase puoi tecnicamente vedere i dati di tutti dal pannello di controllo (non le chiavi di Gemini, che restano sui loro dispositivi). L'app lo spiega in *Impostazioni → Privacy*.
- **Password dimenticata**: c'è il link nella schermata di accesso. Da *Impostazioni → Cambia password* si cambia la password quando si è già dentro.

---

## File

| File | A cosa serve |
|---|---|
| `index.html` | struttura della pagina |
| `style.css` | grafica (tema chiaro/scuro automatico, layout PC e telefono) |
| `app.js` | tutta la logica dell'app e la sincronizzazione |
| `config.js` | le tue chiavi Supabase |
| `sw.js` | service worker: funzionamento offline |
| `manifest.webmanifest`, `icons/` | nome, icone e installazione come app |
| `supabase/schema.sql` | tabella, spazio file e regole di sicurezza del database |
# Squadriglie

Una bacheca per conoscere i ragazzi e comporre squadriglie: schede trascinabili, punti di forza e aspetti da accompagnare, combinazioni alternative duplicabili e utenze di reparto. Installabile sul proprio computer o server, senza ChatGPT, Cloudflare o servizi esterni.

## Avvio rapido

Serve **Node.js 24.15 o successivo della serie 24**. Non occorre installare dipendenze o configurare un database esterno.

```bash
npm start
```

Apri **http://127.0.0.1:3000**. Il primo avvio crea il database persistente in `data/squadriglie.sqlite`.

### Credenziali iniziali

| Accesso | Nome | Password iniziale |
| --- | --- | --- |
| Amministratore, dalla voce “Accesso amministratore” | `admin` | `ChangeMe-Admin26!` |
| Reparto dimostrativo | `Reparto Demo` | `Demo-Reparto26!` |

**Il primo accesso admin richiede obbligatoriamente una nuova password.** Fino ad allora il pannello e le API amministrative sono bloccati. La nuova password deve avere almeno 12 caratteri.

Il reparto demo contiene solo dati inventati. Puoi eliminarlo dal pannello admin; per non crearlo su una nuova installazione, imposta `DEMO_ENABLED=false`. La disattivazione non elimina automaticamente un’utenza già creata.

L’avvio predefinito ascolta solo sul computer locale. Completa la configurazione iniziale prima di rendere il servizio raggiungibile da altri dispositivi.

## Docker

```bash
docker compose up --build -d
```

Apri lo stesso indirizzo. Il database viene conservato nel volume `squadriglie-data` anche quando il contenitore viene ricreato. `docker compose down -v` elimina invece anche i dati.

Per disattivare la demo al primo avvio:

```bash
DEMO_ENABLED=false docker compose up --build -d
```

## Funzioni

- Admin: crea utenze con nome reparto e password; elimina utenze e relative bacheche con conferma esplicita; apre le bacheche per assistere i reparti.
- Reparti: ciascuno vede e modifica solo la propria bacheca.
- Schede con nome, sesso, età, punti di forza e aspetti da accompagnare.
- Numero di squadriglie variabile per ogni opzione; eliminando una squadriglia i suoi ragazzi tornano in “Da assegnare”.
- Più opzioni, rinominabili e duplicabili. Schede comuni alle opzioni, assegnazioni indipendenti.
- La prima scheda assegnata stabilisce il sesso della squadriglia. Gli inserimenti incompatibili producono un avviso e un rimbalzo.
- Ricerca, rinomina delle squadriglie, spostamento dal menu della scheda, stampa, esportazione e importazione JSON.
- Salvataggio automatico sul server e controllo delle modifiche concorrenti.
- Cambio password personale per amministratore e reparti; il cambio revoca le sessioni precedenti.

## Configurazione

Puoi copiare `.env.example` in `.env` e avviare esplicitamente:

```bash
node --env-file=.env server.mjs
```

| Variabile | Predefinito | Significato |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Indirizzo di ascolto; `0.0.0.0` per la rete o un contenitore |
| `PORT` | `3000` | Porta HTTP |
| `DATA_DIR` | `./data` nella cartella del progetto | Cartella persistente SQLite |
| `DEMO_ENABLED` | `true` | Crea la demo solo se il database è nuovo |
| `ADMIN_USERNAME` | `admin` | Nome admin iniziale, solo se il database è nuovo |
| `ADMIN_PASSWORD` | vedi tabella | Password iniziale, solo se il database è nuovo; cambio obbligatorio al login |
| `COOKIE_SECURE` | `false` | Usa cookie HTTPS con prefisso `__Host-` quando vale `true` |
| `PUBLIC_ORIGIN` | non impostata | Origine HTTPS consentita, senza slash finale, quando esposto dietro un proxy |

Il file `.env` e i database sono esclusi da Git. Non inserire credenziali reali nel repository.

### Server condiviso e HTTPS

Per uso locale sul proprio computer basta la configurazione predefinita. Per un server condiviso:

1. Completa il cambio della password admin e rimuovi l’utenza demo o cambiane la password.
2. Configura un reverse proxy HTTPS e mantieni l’app su una rete privata dietro il proxy.
3. Imposta `COOKIE_SECURE=true` e `PUBLIC_ORIGIN=https://il-tuo-dominio`. Il proxy deve preservare l’header `Host` pubblico.
4. Conserva `DATA_DIR` su un volume persistente e configura backup e accessi al server.

Con Compose, aggiungi le variabili HTTPS e l’origine nella sezione `environment`; l’esempio incluso è deliberatamente per accesso locale HTTP. Non vengono considerati attendibili gli header `X-Forwarded-*`. Dietro un reverse proxy i tentativi di login condividono il limite dell’IP del proxy: applica ulteriori limiti per IP anche nel proxy se necessario.

## Dati e backup

Ogni installazione conserva utenti, hash delle password, sessioni e bacheche nel proprio database SQLite. Nessun dato viene inviato a servizi esterni. Il file `data/` non deve essere pubblicato su GitHub.

- **Bacheca:** usa “Esporta bacheca” per conservare tutte le opzioni di un reparto. L’importazione può sostituire la bacheca: conserva prima una copia.
- **Installazione completa:** arresta il servizio e copia tutta la cartella `data/` (o il volume Docker). Ripristinala prima del riavvio.
- **Passaggio dal sito esistente:** esporta la bacheca dal sito, crea o apri un reparto nella versione locale e importa il JSON. Le credenziali e le sessioni del sito non vengono trasferite.

Questa distribuzione non include dati reali di ragazzi, account personali, credenziali del sito ospitato o la sua cronologia Git.

## Test

```bash
npm test
```

I test verificano il cambio iniziale obbligatorio, login, cookie, separazione dei reparti, opzioni e squadriglie variabili, conflitti, revoca delle sessioni, persistenza dopo riavvio e assenza di dipendenze dall’autenticazione del sito originario.

## Licenza

[MIT](LICENSE) · Dario Amoroso d’Aragona.

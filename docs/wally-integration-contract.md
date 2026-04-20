# LedVelvet DoorCheck – Wally Integration Contract

## Obiettivo

Integrare Wallyfor come **authority soci live** nel flusso DoorCheck, senza rompere il comportamento attuale del sistema.

Obiettivo del primo step:
- usare Wally solo nella fase di **risoluzione socio**
- mantenere invariato tutto il resto
- garantire fallback completo al resolver attuale se Wally non è disponibile o non restituisce risultato utile

---

## Stato attuale

Sistema attuale stabile:
- Next.js
- Supabase
- Xceed
- membership sincronizzata da Wally via CSV + sync SQL
- UI members già funzionante

Vincoli confermati:
- **no refactor globale**
- **patch minima**
- **un modulo alla volta**
- **non rompere DoorCheck attuale**

---

## Punto esatto di integrazione

### Flusso attuale

```text
scan Xceed
→ resolve ticket / event
→ resolve member
→ decide outcome Door
→ save live event
→ return response

Perfetto. Ti lascio il documento già pronto da incollare come:

`docs/wally-integration-contract.md`

````md
# LedVelvet DoorCheck – Wally Integration Contract

## Obiettivo

Integrare Wallyfor come **authority soci live** nel flusso DoorCheck, senza rompere il comportamento attuale del sistema.

Obiettivo del primo step:
- usare Wally solo nella fase di **risoluzione socio**
- mantenere invariato tutto il resto
- garantire fallback completo al resolver attuale se Wally non è disponibile o non restituisce risultato utile

---

## Stato attuale

Sistema attuale stabile:
- Next.js
- Supabase
- Xceed
- membership sincronizzata da Wally via CSV + sync SQL
- UI members già funzionante

Vincoli confermati:
- **no refactor globale**
- **patch minima**
- **un modulo alla volta**
- **non rompere DoorCheck attuale**

---

## Punto esatto di integrazione

### Flusso attuale

```text
scan Xceed
→ resolve ticket / event
→ resolve member
→ decide outcome Door
→ save live event
→ return response
````

### Punto in cui entra Wally

Wally deve entrare **solo** qui:

```text
resolve member
```

### Esclusioni esplicite

Wally **non** entra in:

* polling UI
* live monitor
* sync tickets Xceed
* rendering frontend
* members UI
* gestione checkins locale
* tabelle Supabase esistenti

---

## Oggetti coinvolti

### File

* `src/app/api/door/xceed-live-evaluate/route.ts`
* `src/lib/wally.ts` *(previsto, non ancora implementato)*
* `.env.local.example`
* `docs/wally-integration-contract.md`

### Servizi

* Wallyfor API
* Xceed
* Supabase

### Dati interessati

* barcode socio
* stato tessera
* gruppo membership
* dati anagrafici minimi
* debug source del resolver socio

---

## Strategia di integrazione

## Step 1 – Integrazione minima e sicura

Wally sarà usato come **fonte primaria live** solo quando sarà disponibile un lookup affidabile.

Per il primo rilascio:

* se abbiamo un barcode valido → tentativo lookup Wally
* se Wally risponde con esito utile → usare Wally
* se Wally non risponde / non trova / errore → usare resolver attuale
* nessuna rimozione immediata del fallback locale

### Obiettivo pratico dello step 1

Integrare Wally senza modificare il comportamento operativo della porta.

---

## Contratto dati minimo atteso da Wally

## Input minimo richiesto

### Ricerca primaria

* `barcode`

## Output minimo richiesto

Campi minimi attesi da `GET /passes/{barcode}`:

* `barcode`
* `status`
* `first_name`
* `last_name`
* `email`
* `phone`
* `membership_group`
* `expires_at` *(o equivalente)*
* eventuale `id` interno Wally
* eventuale payload raw completo per debug

### Note

Se alcuni nomi campo saranno diversi nella spec reale, il middleware dovrà normalizzarli.

---

## Contratto interno normalizzato DoorCheck

Quando arriverà la risposta Wally, il middleware interno dovrà normalizzare il dato in questo shape logico:

```ts
type WallyMemberResolved = {
  source: "wally_api";
  barcode: string | null;
  status: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  membershipGroup: string | null;
  expiresAt: string | null;
  externalId: string | null;
  raw: unknown;
};
```

---

## Mapping stato Wally → esito Door

### Stati attesi

| Stato Wally                   | Esito Door                |
| ----------------------------- | ------------------------- |
| active / valid / enabled      | accesso consentito        |
| expired / inactive / disabled | `DENY_RENEWAL`            |
| not found                     | fallback resolver attuale |
| errore API / timeout          | fallback resolver attuale |

### Regola operativa

Nel dubbio, al primo step:

* **mai bloccare la porta per un errore tecnico Wally**
* usare fallback locale
* registrare debug chiaro

---

## Mapping gruppo Wally → door_role

| Gruppo Wally       | door_role    |
| ------------------ | ------------ |
| socio ordinario    | `ordinary`   |
| loyalty / priority | `loyalty`    |
| staff / privileged | `privileged` |

### Nota

Il mapping esatto potrà essere raffinato quando avremo:

* elenco gruppi reale
* naming ufficiale Wally
* casi reali di tessere

---

## Policy di fallback

Questa parte è vincolante.

### Regola principale

DoorCheck non deve dipendere in modo hard da Wally nel primo rilascio.

### Comportamento richiesto

* se lookup Wally funziona → usare Wally
* se lookup Wally non disponibile → fallback attuale
* se risposta Wally incompleta → fallback attuale
* se timeout / errore autenticazione / errore rete → fallback attuale

### Obiettivo

Zero regressioni operative.

---

## Debug minimo richiesto

Quando Wally sarà integrato, il route dovrà esporre nel payload di debug almeno:

```ts
debug: {
  member_source: "wally_api" | "local_members" | "none";
  wally_lookup: "hit" | "miss" | "skipped" | "error";
  wally_barcode: string | null;
}
```

### Significato

* `hit` = trovato in Wally
* `miss` = chiamata eseguita ma nessun pass trovato
* `skipped` = lookup non eseguito
* `error` = errore tecnico chiamata Wally

---

## Variabili ambiente previste

Da preparare, senza usarle ancora runtime:

```env
WALLY_API_BASE_URL=
WALLY_API_KEY=
WALLY_API_TIMEOUT_MS=5000
```

Se Wally usa bearer token:

```env
WALLY_API_BEARER_TOKEN=
```

Se Wally richiede header custom:

* da definire appena arriva la spec

---

## Domande aperte verso Wally

Questi punti restano da confermare con la mini-spec API.

### Endpoint

* `GET /passes`
* `GET /passes/{barcode}`
* eventuale `GET /groups`

### Autenticazione

* API key?
* Bearer token?
* IP allowlist?
* header custom?

### Lookup supportati

* solo barcode?
* anche email?
* anche telefono?

### Stabilità identificativo

Domanda fondamentale:

* il barcode del pass è stabile e univoco nel tempo?
* può cambiare con rinnovo?
* può cambiare con riemissione?
* può cambiare con sostituzione tessera?

### Stato tessera

* elenco stati ufficiali disponibili
* valori reali del campo status
* eventuale scadenza/validità
* eventuale flag booleano già pronto

### Futuro

* esiste o è previsto un endpoint per registrare check-in su Wally?

---

## Rischi noti

## Rischio principale

Il barcode disponibile nel flusso Door potrebbe **non coincidere** con l’identificativo giusto per il lookup Wally.

Se succede, `GET /passes/{barcode}` da solo non basta a sostituire completamente il resolver attuale.

## Rischio secondario

Lo stato tessera restituito da Wally potrebbe non essere già normalizzato e richiedere mapping custom.

## Rischio operativo

Eliminare troppo presto il fallback locale potrebbe rompere casi reali oggi funzionanti.

---

## Decisioni già prese

* Wally entra solo nel modulo `resolve member`
* niente refactor globale
* niente modifiche UI
* niente modifiche polling
* niente modifiche sync tickets
* niente modifiche tabelle in questo step
* fallback locale obbligatorio nel primo rilascio
* debug esplicito obbligatorio

---

## Test da fare quando arriva la spec

## Test 1 – lookup positivo

Input con barcode valido
Atteso:

* `member_source = wally_api`
* `wally_lookup = hit`
* esito Door corretto

## Test 2 – pass non valido

Input con barcode di tessera scaduta/inattiva
Atteso:

* `member_source = wally_api`
* esito `DENY_RENEWAL`

## Test 3 – barcode assente

Input senza barcode utile
Atteso:

* `wally_lookup = skipped`
* fallback attuale invariato

## Test 4 – barcode non trovato

Input con barcode inesistente
Atteso:

* `wally_lookup = miss`
* fallback attuale attivo

## Test 5 – errore tecnico API

Errore rete / token / timeout
Atteso:

* `wally_lookup = error`
* fallback attuale attivo
* nessun blocco operativo della porta

---

## Quando questo step è chiuso

Questo step preparatorio è chiuso quando:

1. il punto di integrazione è fissato
2. il contratto dati minimo è definito
3. il mapping stato/gruppo → Door è definito
4. la policy di fallback è definita
5. l’elenco delle domande aperte verso Wally è completo

---

## Quando partirà lo step implementativo

Lo step implementativo partirà solo quando avremo:

* endpoint reale confermato
* auth reale confermata
* almeno un JSON reale di esempio
* chiarimento su barcode stabile/univoco
* chiarimento su lookup alternativi (email / telefono)

---

## Esito finale atteso

Quando l’integrazione sarà completata correttamente:

* DoorCheck userà Wally come authority soci live
* il resolver locale resterà fallback iniziale
* il sistema continuerà a funzionare anche in caso di errore Wally
* il CSV potrà essere dismesso solo dopo verifica reale dei casi porta

```

Questo è già buono così.

Ti dico anche il prossimo micro-step sensato, appena arriva la risposta di Marco: fare una tabella **spec reale vs contratto interno**, così vediamo subito dove coincidono e dove no.
```

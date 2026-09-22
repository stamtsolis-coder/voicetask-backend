# VoiceTask backend

Μικρός Express server με ένα endpoint `POST /parse` που καλεί το Anthropic API
για να μετατρέψει ένα ωμό transcript σε δομημένα tasks (τίτλος, κατηγορία,
άτομο, προθεσμία, προτεραιότητα) — πραγματική κατανόηση context, όχι απλά
keyword matching.

## Τοπικά

```bash
cp .env.example .env   # βάλε το δικό σου ANTHROPIC_API_KEY
npm install
npm run dev
```

Δοκιμή:

```bash
curl -X POST http://localhost:3000/parse \
  -H "Content-Type: application/json" \
  -d '{"transcript":"Να πάρω γάλα, να στείλω το mail στον Γιάννη μέχρι την Παρασκευή"}'
```

## Deploy (χρειάζεται δικό σου λογαριασμό — δεν μπορώ να το κάνω εγώ)

Οποιοδήποτε host που τρέχει Node.js δουλεύει: **Railway**, **Render**,
**Fly.io** είναι τα πιο απλά για ένα μικρό API σαν αυτό.

Γενικά βήματα (ίδια λογική παντού):
1. Δημιούργησε λογαριασμό στον host της επιλογής σου.
2. Σύνδεσε το repo (ή ανέβασε τον φάκελο `backend/`).
3. Ρύθμισε environment variable `ANTHROPIC_API_KEY` (το API key σου από
   https://console.anthropic.com/settings/keys).
4. Start command: `npm start`.
5. Ο host θα σου δώσει ένα public URL (π.χ. `https://voicetask-backend.up.railway.app`).
6. Βάλε αυτό το URL στο `app/app.json` → `expo.extra.apiBaseUrl`.

Χωρίς αυτό το βήμα, η εφαρμογή συνεχίζει να δουλεύει με τον τοπικό,
απλούστερο parser (`app/src/lib/parseFallback.js`) — καλό για δοκιμή,
αλλά χωρίς πραγματική κατανόηση context.

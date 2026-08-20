# Diagnostic et Corrections - Page de Paiement Zaka (/pay)

## Problème Signalé
Lorsqu'un utilisateur accède à `/pay?apikey=sk_live_...&plan=pro`, l'application plante avec l'erreur "Cette page n'a pas pu se charger".

## Causes Probables Identifiées

### 1. Validation trop stricte des paramètres Query
- Le schema Zod original utilisait `z.enum()` pour le paramètre `plan`, ce qui provoquait une exception si la valeur ne correspondait pas exactement aux options prévues
- Un seul nom de paramètre (`api_key`) était accepté, alors que l'URL utilisait `apikey`
- Aucune gestion d'erreur dans `validateSearch` - toute erreur de validation faisait crasher la route

### 2. Absence de mécanisme de repli (Error Boundary)
- La fonction `useQuery` n'avait pas de gestion d'erreur locale
- En cas d'échec de la requête serveur, l'erreur se propageait sans être capturée
- Aucun état d'erreur UI propre n'était affiché

### 3. Vérification de clé API non sécurisée
- La fonction `resolveAppByApiKey` ne validait pas le format de la clé API avant la requête SQL
- En cas d'erreur de base de données, l'exception était propagée au lieu d'être gérée
- Aucun log explicite pour le débogage

## Corrections Implémentées

### 1. Récupération et Validation des Paramètres Query (`/src/routes/pay.tsx`)

```typescript
// Schema flexible acceptant apikey, api_key, ou key
const searchSchema = z.object({
  apikey: z.string().trim().min(1).max(120).optional(),
  api_key: z.string().trim().min(1).max(120).optional(),
  key: z.string().trim().min(1).max(120).optional(),
  plan: z.string().trim().toLowerCase().optional(), // Plus de z.enum() strict
  user_id: z.string().trim().max(80).optional(),
});

// Fonction de normalisation avec try-catch
function normalizeSearchParams(search: unknown): SearchParams {
  try {
    const parsed = searchSchema.parse(search || {});
    const apiKey = parsed.apikey || parsed.api_key || parsed.key;
    // Normalisation du plan : mensuel/monthly -> monthly, annuel/yearly -> yearly
    const rawPlan = parsed.plan || "";
    let normalizedPlan = /* ... */;
    return { apikey: apiKey, api_key: apiKey, key: apiKey, plan: normalizedPlan, user_id: parsed.user_id };
  } catch (error) {
    console.error("[PayPage] Erreur de validation des paramètres:", error);
    return { apikey: undefined, api_key: undefined, key: undefined, plan: undefined, user_id: undefined };
  }
}
```

**Bénéfices :**
- Accepte plusieurs formats de paramètres (`apikey`, `api_key`, `key`)
- Le plan est normalisé automatiquement (cas insensitive)
- Toute erreur de validation retourne des valeurs sûres au lieu de crasher

### 2. Error Boundary / Try-Catch au Niveau du Composant

```typescript
function PayPage() {
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["pay-app", apiKey],
    queryFn: async () => {
      try {
        if (!apiKey) throw new Error("Clé API manquante");
        const result = await resolve({ data: { apiKey } });
        setHasLoaded(true);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Erreur lors de la vérification";
        console.error("[PayPage] Query error:", err);
        setLocalError(errorMessage);
        setHasLoaded(true);
        return null;
      }
    },
    enabled: Boolean(apiKey),
    retry: false,
  });

  // Rendus conditionnels avec UI d'erreur propre
  if (!apiKey && hasLoaded) return <ErreurLienInvalide />;
  if (isLoading) return <Chargement />;
  if (localError || !data) return <ErreurAPI />;
  
  return <PagePaiementNormale />;
}
```

**Bénéfices :**
- Les erreurs sont capturées localement sans faire crasher toute l'app
- L'erreur exacte est loguée dans la console pour le débogage
- L'utilisateur voit un message d'erreur explicite avec un design propre

### 3. Sécurisation de la Vérification de Clé API (`/src/lib/checkout.functions.ts`)

```typescript
export const resolveAppByApiKey = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ apiKey: z.string().trim().min(10).max(120) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { db } = await import("./db.server");
      const sql = db();
      
      // Validation du format de la clé API
      const apiKey = data.apiKey.trim();
      if (!apiKey.startsWith("sk_")) {
        console.warn("[resolveAppByApiKey] Format de clé API invalide:", apiKey.substring(0, 10) + "...");
        return null;
      }
      
      const rows = (await sql`
        SELECT id, name, moncash_number, natcash_number, qr_image_url
        FROM apps WHERE api_key = ${apiKey} LIMIT 1
      `) as PublicApp[];
      
      const app = rows[0] ?? null;
      
      if (!app) {
        console.warn("[resolveAppByApiKey] Clé API non trouvée:", apiKey.substring(0, 15) + "...");
      }
      
      return app;
    } catch (error) {
      console.error("[resolveAppByApiKey] Erreur lors de la résolution:", error);
      return null; // Retourne null au lieu de propager l'erreur
    }
  });
```

**Bénéfices :**
- Validation du format de la clé API (`sk_` prefix) avant la requête SQL
- Logs explicites pour le débogage serveur
- En cas d'erreur DB ou autre, retourne `null` au lieu de faire crasher la requête

### 4. Amélioration de la Gestion d'Erreur DB (`/src/lib/db.server.ts`)

```typescript
export function db(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"];
    if (!url) {
      console.error("[db.server] Variable d'environnement NEON_DATABASE_URL manquante");
      throw new Error("Configuration de la base de données manquante. Vérifiez les variables d'environnement.");
    }
    _sql = neon(url);
  }
  return _sql;
}
```

**Bénéfices :**
- Message d'erreur plus explicite pour le débogage Vercel
- Log côté serveur pour identifier rapidement les problèmes de configuration

## URLs Supportées Après Correction

Les formats d'URL suivants sont maintenant tous supportés :

```
/pay?apikey=sk_live_a0a1215ddbce4c6186fdb8d88be3eb5b&plan=pro
/pay?api_key=sk_live_a0a1215ddbce4c6186fdb8d88be3eb5b&plan=monthly
/pay?key=sk_live_a0a1215ddbce4c6186fdb8d88be3eb5b&plan=mensuel
/pay?apikey=sk_live_a0a1215ddbce4c6186fdb8d88be3eb5b&plan=annuel
/pay?apikey=sk_live_a0a1215ddbce4c6186fdb8d88be3eb5b&plan=yearly
```

## Messages d'Erreur Utilisateur

| Cas | Message Affiché |
|-----|-----------------|
| Clé API manquante dans l'URL | "Lien invalide : La clé API du développeur est manquante ou invalide dans l'URL." |
| Format de clé API invalide | "Clé API invalide : Cette clé API n'est pas reconnue." |
| Clé API non trouvée en DB | "Clé API invalide : Cette clé API n'est pas reconnue. Contactez l'éditeur de l'application." |
| Erreur serveur | "Erreur lors de la vérification de la clé API" (avec détails en console) |

## Déploiement sur Vercel

Après avoir poussé ces changements :

1. Assurez-vous que la variable d'environnement `NEON_DATABASE_URL` est configurée dans Vercel
2. Redéployez l'application
3. Testez avec une URL valide : `/pay?apikey=sk_live_...&plan=monthly`
4. Testez avec une URL invalide pour vérifier l'UI d'erreur

## Fichiers Modifiés

- `/src/routes/pay.tsx` - Refonte complète avec validation flexible et gestion d'erreur
- `/src/lib/checkout.functions.ts` - Ajout de try-catch et validation de format dans `resolveAppByApiKey`
- `/src/lib/db.server.ts` - Message d'erreur amélioré pour la configuration DB

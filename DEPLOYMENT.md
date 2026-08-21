# Déploiement Zaka sur Vercel (base de données Neon)

## 1. Base de données

Le schéma vit dans `db/schema.sql` (idempotent) et tourne sur Neon.
Pour le rejouer sur une nouvelle branche Neon :

```bash
psql "$NEON_DATABASE_URL" -f db/schema.sql
```

La sécurité n'est plus assurée par RLS mais par le code serveur :
chaque `createServerFn` appelle `requireUser()` / `requireAdmin()`
(`src/lib/auth.server.ts`) et filtre par `owner_id`. Les routes
`/api/public/*` restent authentifiées par `x-api-key`.

## 2. Variables d'environnement à créer dans Vercel

| Variable | Rôle |
| --- | --- |
| `NEON_DATABASE_URL` | chaîne de connexion Neon (pooler, `sslmode=require`) |
| `ZAKA_SESSION_SECRET` | clé HMAC de signature des cookies de session (64 caractères aléatoires) |
| `ADMIN_EMAIL` | email exact autorisé pour le déverrouillage secret |
| `ADMIN_PASSWORD` | mot de passe du déverrouillage secret de `/admin-zaka-pro` |
| `ZAKA_ADMIN_PASSWORD` | ancien nom accepté comme repli de `ADMIN_PASSWORD` |

À définir pour les environnements *Production*, *Preview* et *Development*.

Le raccourci `Ctrl+Alt+P` ouvre la fenêtre secrète depuis la console. L'utilisateur
doit être connecté avec le même email et avoir `users.is_admin = true`; la validation
réelle est effectuée côté serveur, jamais avec `sessionStorage` seul.

## 3. Déploiement

1. Connecter ce projet à GitHub (bouton GitHub dans Lovable).
2. Dans Vercel : **Add New → Project → Import** le dépôt, nom du projet `zakapro`.
3. Vercel lit `vercel.json` : build `NITRO_PRESET=vercel bun run build`,
   sortie `.vercel/output` (Build Output API générée par Nitro).
4. Ajouter les variables ci-dessus, puis **Deploy**.

En CLI depuis un poste local :

```bash
npx vercel link --project zakapro
npx vercel env add NEON_DATABASE_URL production
npx vercel --prod
```

## 4. Comptes utilisateurs

Les comptes de l'ancien fournisseur d'authentification n'ont pas pu être
transférés (mots de passe non exportables). Les données métier (applications,
abonnements, clés API) ont été copiées sur Neon. **Le premier compte créé sur
la nouvelle page `/auth` devient administrateur et récupère automatiquement
toutes les applications héritées.**

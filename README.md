# Pro Hub

Crée une interface web moderne, réactive et élégante (Tailwind CSS, composants shadcn/ui) pour un système de gestion centralisée d'abonnements Pro payés via MonCash et Natcash. L'application doit comporter les sections suivantes :



1. Tunnel de Paiement (Composant réutilisable pour toutes les apps connectées) :

   - Étape 1 : Bouton "Passer au plan Pro" ouvrant une modale de sélection de l'abonnement (Mensuel/Annuel avec affichage des montants en Gourdes).

   - Étape 2 : Sélection du mode de paiement (MonCash ou Natcash) et un champ de texte obligatoire pour "Nom complet du compte". Inclure une infobulle / tooltip explicative "En savoir plus" soulignant que le nom doit correspondre exactement à celui du compte émetteur sous peine d'échec d'activation.

   - Étape 3 : Affichage des instructions de paiement, d'un espace pour QR Code, et d'un indicateur de statut en temps réel ("En attente de paiement SMS...").



2. Tableaux de Bord Analytiques par Application (Multi-tenant) :

   - Une vue globale listant toutes les applications connectées.

   - Pour chaque application connectée, une page dédiée accessible via son ID ou nom contenant :

     * Des cartes de statistiques (KPIs) : Nombre total d'abonnés Pro actifs, Montant total encaissé (en HTG), Taux de conversion du tunnel, et Abonnements expirant bientôt.

     * Un graphique interactif montrant l'évolution des revenus et des souscriptions dans le temps.

     * Un tableau historique des transactions récentes (avec colonnes : Utilisateur, Numéro de téléphone, Moyen [MonCash/Natcash], Montant, Statut [Validé/En attente], et Date).



3. Paramètres de l'API :

   - Une section affichant les clés API et les endpoints REST (URL du webhook SMS, URL de vérification de licence) pour que de nouvelles applications tierces puissent s'y brancher facilement.Configure le backend complet et la base de données (Supabase / Edge Functions) pour alimenter le système de paiement automatisé MonCash/Natcash :



1. Schéma de Base de Données (Tables SQL) :

   - Table `apps` : id, name, api_key, created_at.

   - Table `subscriptions` : id, app_id, user_id, user_phone, account_name (nom MonCash/Natcash saisi), plan_type, amount, status ('pending', 'active', 'expired'), created_at, expires_at.

   - Table `sms_logs` : id, raw_content, sender_phone, amount_detected, matched_subscription_id, processed_at.



2. API REST Endpoints (Edge Functions / API Routes) :

   - Endpoint `POST /api/webhook/sms` : Reçoit le SMS brut envoyé par le téléphone relais. Le script doit analyser (parser) le texte pour en extraire automatiquement le montant et le numéro de téléphone, chercher une correspondance dans `subscriptions` (où le montant et le statut sont 'pending'), valider le paiement, basculer le statut en 'active' et définir la date d'expiration.

   - Endpoint `POST /api/v1/checkout/init` : Permet à une application connectée d'initier une demande de paiement en fournissant `app_id`, `user_id`, `amount`, `account_name` (statut initial : 'pending').

   - Endpoint `GET /api/v1/license/verify` : Permet à n'app connectée de vérifier instantanément si un `user_id` possède un abonnement actif (`status: "active"`).



3. Sécurité :

   - Validation par clé API (`x-api-key`) pour sécuriser les requêtes provenant des applications tierces et du téléphone relais SMS.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://moncash-natcash-flow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/54e2f25a-35c8-455c-9e5a-79dfc2d84ff3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

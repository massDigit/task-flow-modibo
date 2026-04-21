# Journal de Bord - Task-Flow Modibo

## Informations Générales

- **Binôme :** Samuel & jeremy
- **Projet :** Task-Flow (Gestion de tâches avec Supabase & TypeScript)
- **Supabase URL :** `https://mnfnerhjsvdpegjgritr.supabase.co/`

---

## Phase 1 : Refonte et Migration TypeScript

### Ce que nous avons fait

Nous avons migré l'intégralité du projet de JavaScript (CommonJS) vers **TypeScript (ESModules)** pour garantir une meilleure robustesse et un typage strict des données Supabase.

### Choix techniques

- **Langage :** TypeScript 5+ avec `nodenext` pour le support natif des modules ES.
- **Build :** Génération des fichiers JavaScript dans le dossier `dist` pour une exécution stable en mode ESM.
- **Exécution :** Utilisation de `node` sur les fichiers compilés (`dist/*.js`) pour les tests, garantissant une meilleure compatibilité avec le système de modules de Node.js.
- **Configuration :** Utilisation d'extensions `.js` dans les imports sources (obligatoire pour le build ESM TypeScript).

### Code clé (tsconfig.json)

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "target": "esnext",
    "noEmit": false,
    "outDir": "./dist",
    "strict": true
  }
}
```

---

## Phase 2 : Tests de Sécurité et RLS (Row Level Security)

### Ce que nous avons fait

Création d'un script de test automatisé `test-rls.ts` pour vérifier que les données ne sont pas accessibles sans authentification.

### Problème rencontré : Récursion Infinie (Infinite Recursion)

Lors de l'exécution du test, nous avons reçu l'erreur suivante :

> ` Erreur API : infinite recursion detected in policy for relation "project_members"`

**Analyse :** La politique `members_read` tentait de vérifier l'appartenance à un projet en effectuant un `SELECT` sur elle-même, créant une boucle logique infinie dans PostgreSQL.

### Résolution (La commande/code qui a débloqué)

Nous avons utilisé une fonction PostgreSQL avec `SECURITY DEFINER` pour casser la récursion. Cela permet à la fonction de vérifier les droits sans déclencher à nouveau les politiques RLS sur la même table.

**SQL de correction :**

```sql
CREATE OR REPLACE FUNCTION check_project_membership(p_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Application de la nouvelle politique
DROP POLICY "members_read" ON project_members;
CREATE POLICY "members_read" ON project_members FOR SELECT
USING (check_project_membership(project_id));
```

---

## Phase 3 : Validation Finale

### Script de test (package.json)

```json
{
  "scripts": {
    "build": "tsc",
    "test:rls": "node dist/test-rls.js"
  }
}
```

### Résultat du terminal (Output de `npm run test:rls`)

```text
--- Testing Row Level Security (RLS) ---

Test 1: Accès public (non authentifié)
Données reçues (Sans auth): 0 (attendu: 0 si RLS actif)

Test 2: Tentative d'insertion (non authentifié)
✅ Insertion bloquée par RLS : new row violates row-level security policy for table "tasks"

--- Fin des tests ---
```

### Ce qui a marché

- La connexion à Supabase via les variables d'environnement (`.env`).
- L'interception correcte des tentatives d'intrusion par les politiques RLS.
- Le typage complet des fonctions `signUp`, `signIn` et `signOut`.

### Ce qui a bloqué

- La résolution des imports ESModules en TypeScript (résolu par l'utilisation du dossier `dist` et des extensions `.js`).
- L'erreur de récursion RLS (résolue par la fonction `SECURITY DEFINER`).

---

## 🔐 Phase 4 : Gestion des Permissions et Modèle Collaboratif

### Évolution de la Stratégie de Sécurité

Initialement, nous avions configuré le RLS pour restreindre la modification des tâches à l'assigné ou au propriétaire du projet uniquement.

**Décision Finale :** Nous avons opté pour un **modèle collaboratif**, où n'importe quel membre d'un projet a le droit de lire et de modifier n'importe quelle tâche de ce même projet. Cela facilite la coordination au sein de l'équipe sans imposer de verrous bloquants pour les coéquipiers.

### Mise en œuvre RLS (Collaboration)

La politique `tasks_update` a été simplifiée pour s'appuyer sur l'appartenance au projet via la table `project_members`.

**SQL final appliqué :**

```sql
CREATE POLICY "tasks_update" ON "public"."tasks"
FOR UPDATE TO authenticated
USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
)
WITH CHECK (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);
```

### Validation Finale du Test de Sécurité

Le script de test `test-rls.ts` valide désormais que :

- Samuel peut modifier ses propres tâches.
- Samuel peut modifier la tâche de Jérémy (car ils font partie du même projet).
- Un utilisateur anonyme ou non-membre reste strictement bloqué.

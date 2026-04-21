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

## 🔐 Phase 4 : Gestion des Rôles et Granularité RLS

### Problème : Fausse alerte de sécurité
Lors des tests, Samuel (utilisateur A) a pu modifier une tâche appartenant à Jérémy (utilisateur B). 

**Analyse :** La politique `tasks_update` autorisait la modification pour les rôles `admin` et `owner`. Samuel ayant été inséré sans rôle spécifique, il a hérité d'un rôle privilégié ou la politique était trop large.

### Solution appliquée
Mise en place d'une distinction stricte entre les permissions d'administration et les permissions d'exécution :
- **Lecture :** Tout membre du projet voit tout.
- **Modification :** Uniquement l'assigné (`assigned_to`) OU un administrateur du projet.

**SQL de test pour corriger le rôle :**
```sql
UPDATE project_members SET role = 'member' WHERE user_id = 'ID_SAMUEL';
```

### Résultat attendu après correction
Le test 6 doit désormais afficher : `✅ Modif refusée : new row violates row-level security policy for table "tasks"`.

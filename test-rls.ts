import "dotenv/config";
import { supabase } from "./client.js";
import { signIn, signOut } from "./auth.js";

async function runSecurityTests() {
  console.log("--- Testing Row Level Security (RLS) ---");

  // Test 1 : Sans authentification
  console.log("\nTest 1: Acces public (non authentifie)");
  try {
    const { data: noAuth, error: noAuthError } = await supabase
      .from("tasks")
      .select("*");

    if (noAuthError) {
      console.log("Erreur API :", noAuthError.message);
    } else {
      console.log(
        "Donnees recues (Sans auth):",
        noAuth?.length,
        "(attendu: 0 si RLS actif)",
      );
    }
  } catch (err: any) {
    console.error("Erreur critique lors de la requete :", err.message);
  }

  // Test 2 : Tentative d'insertion sans auth
  console.log("\nTest 2: Tentative d'insertion (non authentifie)");
  try {
    const { error: insertError } = await supabase
      .from("tasks")
      .insert({ title: "Hack task" });

    if (insertError) {
      console.log("Succes : Insertion bloquee par RLS :", insertError.message);
    } else {
      console.log(
        "Alerte de securite : Insertion reussie sans authentification !",
      );
    }
  } catch (err: any) {
    console.error("Erreur critique lors de l'insertion :", err.message);
  }

  // NOUVEAUX TESTS AUTHENTIFIÉS
  console.log("\n--- Tests Authentifies (Samuel) ---");
  try {
    const email = process.env.User_Auth_Email_Test;
    const password = process.env.User_Auth_Password_Test;
    const jeremyUserId = process.env.User_Auth_uuid_Test_1;
    const projectId = process.env.Project_Id_Test;

    if (!email || !password || !jeremyUserId || !projectId) {
      console.error("Erreur : Variables d'environnement manquantes dans le fichier .env");
      return;
    }

    console.log(`\nTest 3: Connexion de ${email}...`);
    const loginData = await signIn(email, password);
    const userId = loginData.user?.id;
    console.log("Authentifie ! ID Utilisateur :", userId);

    // Test 4 : Samuel voit toutes les tâches du projet (Visibilité Collaborative)
    const { data: tasks, error: selectError } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId);

    if (selectError) console.log("Erreur SELECT :", selectError.message);
    console.log(`Tasks du projet (vues): ${tasks?.length || 0}`);

    // Test 5 : Samuel tente de modifier sa PROPRE tâche
    console.log("\nTest 5: Samuel modifie sa propre tache...");
    const { data: samuelTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("assigned_to", userId)
      .eq("project_id", projectId)
      .limit(1)
      .single();

    if (samuelTask) {
      const { error: ownUpdateError } = await supabase
        .from("tasks")
        .update({ title: "Ma tache modifiee par moi-meme" })
        .eq("id", samuelTask.id);
      
      if (ownUpdateError) {
        console.log("Erreur inattendue :", ownUpdateError.message);
      } else {
        console.log("Succes : Samuel a pu modifier sa propre tache.");
      }
    } else {
      console.log("Info : Aucune tache de Samuel trouvee pour ce test.");
    }

    // Test 6 : Samuel tente de modifier la tâche de Jérémy (doit ÉCHOUER)
    console.log(`\nTest 6: Tentative de modifier la tache de Jeremy (${jeremyUserId})...`);
    const { data: jeremyTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("assigned_to", jeremyUserId)
      .eq("project_id", projectId)
      .limit(1)
      .single();

    if (jeremyTask) {
      const { data: updateResult, error: collabUpdateError } = await supabase
        .from("tasks")
        .update({ title: "Modifie par Samuel sans permission" })
        .eq("id", jeremyTask.id)
        .select();

      if (collabUpdateError) {
        console.log("Succes : Le RLS a bloque avec une erreur :", collabUpdateError.message);
      } else if (!updateResult || updateResult.length === 0) {
        console.log("Succes : Le RLS a bloque silencieusement (0 ligne modifiee), ce qui est le comportement attendu de Supabase.");
      } else {
        console.log("Alerte de securite : Samuel a pu modifier la tache de Jeremy !");
      }
    } else {
      console.log("Info : Aucune tache de Jeremy trouvee pour le test de securite.");
    }

    // Test 7 : Samuel tente de réassigner sa propre tâche à Jérémy (doit ÉCHOUER)
    console.log("\nTest 7: Samuel tente de reassigner sa propre tache a Jeremy...");
    if (samuelTask) {
      const { error: reassignmentError } = await supabase
        .from("tasks")
        .update({ assigned_to: jeremyUserId })
        .eq("id", samuelTask.id);

      if (reassignmentError) {
        console.log("Succes : Le RLS a bien bloque la reassignation par un membre :", reassignmentError.message);
      } else {
        console.log("Alerte de securite : Samuel a pu changer l'assignation de sa tache !");
      }
    }

    // Test 8 : Samuel tente de créer une tâche assignée à Jérémy (doit ÉCHOUER)
    console.log("\nTest 8: Samuel tente de creer une tache assignee a Jeremy...");
    const { error: insertToOtherError } = await supabase
      .from("tasks")
      .insert({ 
        title: "Tache imposee par Samuel", 
        project_id: projectId,
        assigned_to: jeremyUserId 
      });

    if (insertToOtherError) {
      console.log("Succes : Le RLS a bien bloque l'assignation forcee lors de la creation :", insertToOtherError.message);
    } else {
      console.log("Alerte de securite : Samuel a pu creer une tache assignee a Jeremy !");
    }

    // Test 9 : Samuel crée une tâche pour lui-même (doit RÉUSSIR)
    console.log("\nTest 9: Samuel cree une tache pour lui-meme...");
    const { error: insertOwnError } = await supabase
      .from("tasks")
      .insert({ 
        title: "Ma nouvelle tache", 
        project_id: projectId,
        assigned_to: userId 
      });

    if (insertOwnError) {
      console.log("Erreur (Le RLS a bloque injustement) :", insertOwnError.message);
    } else {
      console.log("Succes : Samuel a pu creer sa propre tache.");
    }

    await signOut();
    console.log("\nDeconnecte.");
  } catch (err: any) {
    console.log("\nErreur lors des tests authentifies :", err.message);
  }

  console.log("\n--- Fin des tests ---");
}

runSecurityTests().catch(console.error);

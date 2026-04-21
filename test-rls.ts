import "dotenv/config";
import { supabase } from "./client.js";
import { signIn, signOut } from "./auth.js";

async function runSecurityTests() {
  console.log("--- Testing Row Level Security (RLS) ---");

  // Test 1 : Sans authentification
  console.log("\nTest 1: Accès public (non authentifié)");
  try {
    const { data: noAuth, error: noAuthError } = await supabase
      .from("tasks")
      .select("*");

    if (noAuthError) {
      console.log("❌ Erreur API :", noAuthError.message);
    } else {
      console.log(
        "Données reçues (Sans auth):",
        noAuth?.length,
        "(attendu: 0 si RLS actif)",
      );
    }
  } catch (err: any) {
    console.error("❌ Erreur critique lors de la requête :", err.message);
  }

  // Test 2 : Tentative d'insertion sans auth
  console.log("\nTest 2: Tentative d'insertion (non authentifié)");
  try {
    const { error: insertError } = await supabase
      .from("tasks")
      .insert({ title: "Hack task" });

    if (insertError) {
      console.log("✅ Insertion bloquée par RLS :", insertError.message);
    } else {
      console.log(
        "⚠️  Alerte de sécurité : Insertion réussie sans authentification !",
      );
    }
  } catch (err: any) {
    console.error("❌ Erreur critique lors de l'insertion :", err.message);
  }

  // NOUVEAUX TESTS AUTHENTIFIÉS
  console.log("\n--- Tests Authentifiés (Samuel) ---");
  try {
    // Note: samuel et son mot de passe doivent exister dans Supabase Auth
    const email = process.env.User_Auth_Email_Test || " ";
    const password = process.env.User_Auth_Password_Test || " ";

    console.log(`\nTest 3: Connexion de ${email}...`);
    const loginData = await signIn(email, password);
    const userId = loginData.user?.id;
    console.log("✅ Authentifié ! ID Utilisateur :", userId);

    // Test 4 : Samuel voit ses tâches
    const { data: tasks, error: selectError } = await supabase.from("tasks").select("*");
    if (selectError) console.log("❌ Erreur SELECT :", selectError.message);
    console.log("Tasks Samuel (vues):", tasks?.length);

    // Test 5 : Samuel tente de modifier sa PROPRE tâche
    console.log("\nTest 5: Samuel modifie sa propre tâche...");
    const { data: samuelTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("assigned_to", userId)
      .limit(1)
      .single();

    if (samuelTask) {
      const { error: ownUpdateError } = await supabase
        .from("tasks")
        .update({ title: "Ma tâche modifiée par moi-même" })
        .eq("id", samuelTask.id);
      
      if (ownUpdateError) {
        console.log("❌ Erreur inattendue :", ownUpdateError.message);
      } else {
        console.log("✅ Succès : Samuel a pu modifier sa propre tâche.");
      }
    } else {
      console.log("ℹ️ Aucune tâche de Samuel trouvée pour ce test.");
    }

    // Test 6 : Samuel peut modifier la tâche de Jérémy (Mode Collaboratif)
    const jeremyUserId = process.env.User_Auth_uuid_Test_1 || " ";
    console.log(`\nTest 6: Tentative de modifier la tâche de Jérémy (${jeremyUserId}) en tant que membre...`);

    const { data: jeremyTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("assigned_to", jeremyUserId)
      .limit(1)
      .single();

    if (jeremyTask) {
      const { error: collabUpdateError } = await supabase
        .from("tasks")
        .update({ title: "Modifié par Samuel (Collaboration)" })
        .eq("id", jeremyTask.id);

      if (collabUpdateError) {
        console.log("❌ Erreur (Le RLS a bloqué) :", collabUpdateError.message);
      } else {
        console.log("✅ Succès : Samuel a pu modifier la tâche de Jérémy (Comportement collaboratif attendu).");
      }
    } else {
      console.log("ℹ️ Aucune tâche de Jérémy trouvée pour le test de collaboration.");
    }

    await signOut();
    console.log("\n✅ Déconnecté.");
  } catch (err: any) {
    console.log("\n❌ Erreur lors des tests authentifiés :", err.message);
  }

  console.log("\n--- Fin des tests ---");
}

runSecurityTests().catch(console.error);

import "dotenv/config";
import { signIn } from "./auth.js";
import { createTask, updateTaskStatus, addComment } from "./tasks.js";
import { subscribeToProject } from "./realtime.js"; // Importation de l'abonnement

const PROJECT_ID = process.argv[2] || "51cb5353-8cd1-4a69-8c5e-9ce9a5cc2844";
const EMAIL = process.env.User_Auth_Email_Test_2 || "jeremyboureux@gmail.com"; 
const PASSWORD = process.env.User_Auth_Password_Test || "test1234";

console.log(`--- [Jérémy] Début des actions (${EMAIL}) ---`);

try {
  await signIn(EMAIL, PASSWORD);
  console.log("✅ Jérémy connecté.");

  // Jérémy s'abonne aussi au projet pour activer la présence
  const unsub = subscribeToProject(PROJECT_ID, {
    onPresenceChange: (u) => console.log(`👥 [Jérémy] Nous sommes ${u.length} sur le projet.`),
  });

  // On attend un peu que la présence se synchronise
  await new Promise((r) => setTimeout(r, 2000));

  console.log("🛠️ Création d'une tâche de test...");
  const task = await createTask(PROJECT_ID, {
    title: "Test Présence & Realtime",
    priority: "high",
    description: "Vérification que Samuel me voit en ligne"
  });
  console.log(`✅ Tâche créée ID: ${task.id}`);

  await new Promise((r) => setTimeout(r, 2000));

  console.log("🔄 Mise à jour du statut...");
  await updateTaskStatus(task.id, "in_progress");

  await new Promise((r) => setTimeout(r, 2000));

  console.log("💬 Ajout d'un commentaire...");
  await addComment(task.id, "Regarde Samuel, je suis bien affiché en ligne !");

  // On laisse un peu de temps pour voir la présence avant de quitter
  await new Promise((r) => setTimeout(r, 5000));

  unsub(); // Jérémy se déconnecte du canal
  console.log("\n--- [Jérémy] Actions terminées ---");
} catch (error: any) {
  console.error("❌ Erreur Jérémy :", error.message);
}

import "dotenv/config";
import { signIn } from "./auth.js";
import { subscribeToProject } from "./realtime.js";

// ID du projet trouvé automatiquement
const PROJECT_ID = process.argv[2] || "51cb5353-8cd1-4a69-8c5e-9ce9a5cc2844";
const EMAIL = process.env.User_Auth_Email_Test || "";
const PASSWORD = process.env.User_Auth_Password_Test || "";

console.log(`--- [Samuel] Connexion en cours (${EMAIL})... ---`);

try {
  await signIn(EMAIL, PASSWORD);
  console.log("✅ Samuel connecté.");

  const unsub = subscribeToProject(PROJECT_ID, {
    onTaskCreated: (t) => console.log("🆕 [Samuel] Notification : Jérémy a créé la tâche ->", t.title),
    onTaskUpdated: (n, o) => console.log(`🔄 [Samuel] Notification : Statut modifié -> ${o.status} en ${n.status}`),
    onCommentAdded: (c) => console.log("💬 [Samuel] Notification : Nouveau commentaire ->", c.content),
    onPresenceChange: (u) => console.log("👥 [Samuel] Personnes sur le projet :", u.length),
  });

  console.log(`📡 Samuel écoute le projet ${PROJECT_ID}... (Ctrl+C pour quitter)`);

  process.on("SIGINT", () => {
    unsub();
    console.log("\n🛑 Fin de session pour Samuel.");
    process.exit();
  });
} catch (error: any) {
  console.error("❌ Erreur Samuel :", error.message);
}

import { createUploadthing, type FileRouter } from "uploadthing/server";
import { supabase } from "./client.js";

const f = createUploadthing();

/**
 * UploadThing Router Configuration
 * Handles file uploads securely by verifying Supabase sessions.
 */
export const uploadRouter = {
  // Configuré pour les pièces jointes de tâches
  taskAttachment: f({
    image: { maxFileSize: "4MB", maxFileCount: 1 },
    pdf: { maxFileSize: "8MB", maxFileCount: 1 },
  })
    .middleware(async ({ req }) => {
      // 1. Extraction du token d'authentification
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null;

      if (!token) {
        throw new Error("Non authentifié : Token manquant");
      }

      // 2. Validation de la session avec Supabase
      // On utilise le token pour récupérer l'utilisateur réel
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        throw new Error(`Non autorisé : Session invalide (${error?.message || "Utilisateur inconnu"})`);
      }

      // 3. Retourner les métadonnées pour l'étape onUploadComplete
      // On peut ajouter ici des vérifications supplémentaires (ex: RLS, rôles)
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Cette partie s'exécute côté serveur une fois l'upload terminé
      console.log(`[Upload Success] User ${metadata.userId} a uploadé : ${file.url}`);

      // Sécurité : On retourne uniquement les infos nécessaires
      return { url: file.url, name: file.name, uploadedBy: metadata.userId };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof uploadRouter;

/**
 * Note: Pour la partie Client (React), il est recommandé de l'isoler
 * dans un fichier .tsx si vous utilisez une interface graphique.
 *
 * import { generateUploadButton } from "@uploadthing/react";
 * export const UploadButton = generateUploadButton<OurFileRouter>({
 *   url: "/api/uploadthing"
 * });
 */

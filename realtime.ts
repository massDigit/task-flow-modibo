import { supabase } from "./client.js";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Interfaces pour les rappels (callbacks) de l'abonnement temps réel
 */
export interface RealtimeCallbacks {
  onTaskCreated?: (newTask: any) => void;
  onTaskUpdated?: (newTask: any, oldTask: any) => void;
  onTaskDeleted?: (oldTask: any) => void;
  onCommentAdded?: (newComment: any) => void;
  onPresenceChange?: (users: Array<{ username: string; online_at: string; [key: string]: any }>) => void;
}

/**
 * S'abonne aux changements en temps réel d'un projet spécifique.
 * Gère les modifications des tâches, les nouveaux commentaires et la présence des utilisateurs.
 * 
 * @param projectId - L'identifiant unique du projet
 * @param callbacks - Objet contenant les fonctions à exécuter lors des événements
 * @returns Une fonction de désinscription pour nettoyer le canal
 */
export function subscribeToProject(projectId: string, callbacks: RealtimeCallbacks) {
  const channel = supabase.channel(`project:${projectId}`);

  // 1. Écoute des changements sur la table 'tasks' pour ce projet
  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "tasks",
      filter: `project_id=eq.${projectId}`,
    },
    (payload: RealtimePostgresChangesPayload<any>) => {
      if (payload.eventType === "INSERT") {
        callbacks.onTaskCreated?.(payload.new);
      } else if (payload.eventType === "UPDATE") {
        callbacks.onTaskUpdated?.(payload.new, payload.old);
      } else if (payload.eventType === "DELETE") {
        callbacks.onTaskDeleted?.(payload.old);
      }
    }
  );

  // 2. Écoute des nouveaux commentaires sur le projet (INSERT uniquement)
  // Note: Si vous voulez filtrer par projet ici, assurez-vous que la table 'comments' 
  // a une colonne project_id ou utilisez une logique de filtrage côté client.
  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "comments",
    },
    (payload: RealtimePostgresChangesPayload<any>) => {
      callbacks.onCommentAdded?.(payload.new);
    }
  );

  // 3. Gestion de la Présence (qui est en ligne sur ce projet)
  channel.on("presence", { event: "sync" }, () => {
    const newState = channel.presenceState();
    const users = Object.values(newState).flat() as any[];
    callbacks.onPresenceChange?.(users);
  });

  // 4. Souscription et suivi de l'utilisateur actuel
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      const { data: { user } } = await supabase.auth.getUser();
      
      // On commence à suivre l'utilisateur sur ce canal
      await channel.track({
        user_id: user?.id,
        username: user?.email,
        online_at: new Date().toISOString(),
      });
    }
  });

  // Retourne la fonction de nettoyage
  return () => {
    supabase.removeChannel(channel);
  };
}

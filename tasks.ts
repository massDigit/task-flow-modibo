import { supabase } from "./client.js";

/**
 * Filtres optionnels pour la récupération des tâches
 */
export interface TaskFilters {
  status?: "todo" | "in_progress" | "review" | "done" | string;
  priority?: "low" | "medium" | "high" | string;
}

/**
 * Données nécessaires pour la création d'une tâche
 */
export interface CreateTaskData {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  assignedTo?: string | null;
  dueDate?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
}

/**
 * Interface représentant une tâche avec ses relations
 */
export interface TaskWithDetails {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  project_id: string;
  created_at: string;
  assigned_to?: string | null;
  created_by: string;
  due_date?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  // Relations incluses via le .select()
  assigned_profile?: {
    username: string;
    full_name: string;
  } | null;
  creator?: {
    username: string;
  } | null;
  comments?: {
    count: number;
  }[];
}

/**
 * Récupère les tâches d'un projet avec filtrage optionnel.
 */
export async function getProjectTasks(
  projectId: string,
  filters: TaskFilters = {}
): Promise<TaskWithDetails[]> {
  let query = supabase
    .from("tasks")
    .select(`
      *,
      assigned_profile:profiles!tasks_assigned_to_fkey(username, full_name),
      creator:profiles!tasks_created_by_fkey(username),
      comments(count)
    `)
    .eq("project_id", projectId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;
  return (data as unknown as TaskWithDetails[]) || [];
}

/**
 * Crée une nouvelle tâche dans un projet.
 */
export async function createTask(projectId: string, taskData: CreateTaskData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Utilisateur non authentifié");

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      title: taskData.title,
      description: taskData.description,
      priority: taskData.priority ?? "medium",
      assigned_to: taskData.assignedTo ?? null,
      due_date: taskData.dueDate ?? null,
      file_url: taskData.fileUrl ?? null, // URL Uploadthing
      file_name: taskData.fileName ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Met à jour le statut d'une tâche.
 */
export async function updateTaskStatus(taskId: string, status: string) {
  const valid = ["todo", "in_progress", "review", "done"];
  if (!valid.includes(status)) throw new Error("Statut invalide");

  const { data, error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Assigne une tâche à un utilisateur.
 */
export async function assignTask(taskId: string, userId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .update({ assigned_to: userId })
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Ajoute un commentaire à une tâche.
 */
export async function addComment(taskId: string, content: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Utilisateur non authentifié");

  const { data, error } = await supabase
    .from("comments")
    .insert({
      task_id: taskId,
      author_id: user.id,
      content,
    })
    .select("*, author:profiles(username)")
    .single();

  if (error) throw error;
  return data;
}

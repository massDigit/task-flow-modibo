import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { createClient } from "@supabase/supabase-js";

interface ValidateTaskPayload {
  project_id: string;
  title: string;
  due_date: string;
  assigned_to: string;
}

export async function validate_task(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const authHeader = request.headers["authorization"];
  if (!authHeader) {
    return { status: 401, body: "Non authentifié" };
  }
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } },
  );
  const payload: ValidateTaskPayload =
    (await request.json()) as ValidateTaskPayload;

  const { project_id, title, due_date, assigned_to } = payload;
  const errors = [];
  if (!title || title.trim().length < 3)
    errors.push("Le titre doit faire au moins 3 caractères");
  if (title?.length > 200)
    errors.push("Le titre ne peut pas dépasser 200 caractères");
  if (due_date && new Date(due_date) < new Date())
    errors.push("La date d'échéance ne peut pas être dans le passé");
  if (assigned_to) {
    const { data: membership } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", project_id)
      .eq("user_id", assigned_to)
      .single();
    if (!membership)
      errors.push("L'utilisateur assigné n'est pas membre du projet");
  }
  if (errors.length > 0) {
    return {
      status: 400,
      body: JSON.stringify({ valid: false, errors }),
    };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      project_id,
      title: title.trim(),
      due_date,
      assigned_to,
      created_by: user?.id,
    })
    .select()
    .single();
  return error
    ? { status: 500, body: JSON.stringify({ error: error.message }) }
    : { status: 201, body: JSON.stringify({ valid: true, task }) };
}

app.http("validate_task", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: validate_task,
});

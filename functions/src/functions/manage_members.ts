import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { createClient } from "@supabase/supabase-js";

interface ManageMembersPayload {
  action: string;
  project_id: string;
  target_user_id: string;
  role: string;
}

export async function manage_members(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const authHeader = request.headers["authorization"];
  if (!authHeader) {
    return { status: 401, body: "Unauthorized" };
  }
  const userClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } },
  );
  const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return { status: 401, body: "Invalid token" };
  }
  const payload: ManageMembersPayload =
    (await request.json()) as ManageMembersPayload;

  const { action, project_id, target_user_id, role } = payload;
  // Vérifier que l'appelant est admin ou owner
  const { data: callerRole } = await adminClient
    .from("project_members")
    .select("role")
    .eq("project_id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!callerRole || !["admin", "owner"].includes(callerRole.role)) {
    return { status: 403, body: JSON.stringify({ error: "Admin requis" }) };
  }
  if (action === "add") {
    const { error } = await adminClient
      .from("project_members")
      .insert({ project_id, user_id: target_user_id, role: role ?? "member" });
    return error
      ? { status: 400, body: JSON.stringify({ error: error.message }) }
      : { status: 200, body: JSON.stringify({ success: true }) };
  }
  if (action === "remove") {
    const { data: target } = await adminClient
      .from("project_members")
      .select("role")
      .eq("project_id", project_id)
      .eq("user_id", target_user_id)
      .single();
    if (target?.role === "owner") {
      return {
        status: 403,
        body: JSON.stringify({ error: "Impossible de retirer le owner" }),
      };
    }
    const { error } = await adminClient
      .from("project_members")
      .delete()
      .eq("project_id", project_id)
      .eq("user_id", target_user_id);
    return error
      ? { status: 400, body: JSON.stringify({ error: error.message }) }
      : { status: 200, body: JSON.stringify({ success: true }) };
  }
  return {
    status: 400,
    body: JSON.stringify({ error: "action invalide" }),
  };
}

app.http("manage_members", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: manage_members,
});

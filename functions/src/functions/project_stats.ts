import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { createClient } from "@supabase/supabase-js";

export async function project_stats(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const projectId = request.query.get("project_id");
  if (!projectId) {
    return { status: 400, body: "project_id requis" };
  }
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );
  const { data: allTasks } = await supabase
    .from("tasks")
    .select("status, due_date, assigned_to")
    .eq("project_id", projectId);
  const statusCount = (allTasks ?? []).reduce((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const today = new Date().toISOString().split("T")[0];
  const overdueCount = (allTasks ?? []).filter(
    (t) => t.due_date && t.due_date < today && t.status !== "done",
  ).length;
  const uniqueMembers = new Set(
    (allTasks ?? []).map((t) => t.assigned_to).filter(Boolean),
  ).size;
  const total = allTasks?.length ?? 0;
  const done = statusCount["done"] ?? 0;
  return {
    status: 200,
    body: JSON.stringify({
      total_tasks: total,
      completion_rate: total > 0 ? Math.round((done / total) * 100) : 0,
      by_status: statusCount,
      overdue_count: overdueCount,
      active_members: uniqueMembers,
    }),
  };
}

app.http("project_stats", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: project_stats,
});

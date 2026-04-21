import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

interface NotifyAssignedPayload {
  type: string;
  record: Task;
  old_record: Task;
}

interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: "todo" | "in_progess" | "review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assigned_to: string;
  due_date: Date;
  file_url: string;
  file_name: string;
}

async function getUserInfo(userId: string) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });

  if (!userRes.ok) {
    throw new Error(`Failed to fetch user: ${userRes.statusText}`);
  }

  const user = await userRes.json();

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=username,full_name`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  );

  if (!profileRes.ok) {
    throw new Error(`Failed to fetch profile: ${profileRes.statusText}`);
  }

  const profileData = await profileRes.json();
  const profile = Array.isArray(profileData) ? profileData[0] : {};

  return { email: user.email, ...profile };
}

async function insertNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  metadata: unknown,
) {
  await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ user_id: userId, type, title, body, metadata }),
  });
}

export async function notify_assigned(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const payload: NotifyAssignedPayload =
      (await request.json()) as NotifyAssignedPayload;

    if (!payload || payload.type !== "UPDATE") {
      return { status: 200, body: "ignored" };
    }

    const { record, old_record } = payload;

    const newAssignee = record?.assigned_to;
    const oldAssignee = old_record?.assigned_to;

    if (!newAssignee || newAssignee === oldAssignee) {
      return { status: 200, body: "no new assignment" };
    }

    const assignee = await getUserInfo(newAssignee);

    await resend.emails.send({
      from: "TaskFlow <taskflow@inter-meg.fr>",
      to: [assignee.email],
      subject: `[TaskFlow] Nouvelle tâche : ${record.title}`,
      html: `<h2>Bonjour ${assignee.full_name ?? assignee.username},</h2>
    <p>Tâche assignée : <strong>${record.title}</strong></p>
    <p>Priorité : ${record.priority}</p>`,
    });

    await insertNotification(
      newAssignee,
      "task_assigned",
      `Changement d'assignation a une tache : ${record.title}`,
      `From ${old_record.assigned_to} To ${record.assigned_to}`,
      { task_id: record.id, project_id: record.project_id },
    );

    return { status: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    return {
      status: 400,
      body: `Invalid request. ${error}`,
    };
  }
}

app.http("notify_assigned", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: notify_assigned,
});

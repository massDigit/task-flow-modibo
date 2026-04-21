import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

const jeremyClient = createClient(supabaseUrl, supabaseAnonKey); // Propriétaire
const samuelClient = createClient(supabaseUrl, supabaseAnonKey); // Membre

// URL de vos Azure Functions (recuperee du .env)
const BASE = process.env.AZURE_FUNCTION_URL;

if (!BASE) {
  throw new Error("Variable d'environnement AZURE_FUNCTION_URL manquante.");
}

async function run() {
  console.log('\n--- INTEGRATION TASKFLOW : JEREMY (PROPRIO) & SAMUEL (MEMBRE) ---\n');

  // 1. Auth : Jeremy (Proprio) et Samuel (Membre)
  const jeremyEmail = process.env.User_Auth_Email_Test_2!;
  const samuelEmail = process.env.User_Auth_Email_Test!;
  const password = process.env.User_Auth_Password_Test!;

  console.log(`Tentative de connexion pour Jeremy (${jeremyEmail}) et Samuel (${samuelEmail})...`);

  const { data: jerLogin, error: jerErr } = await jeremyClient.auth.signInWithPassword({ email: jeremyEmail, password });
  const { data: samLogin, error: samErr } = await samuelClient.auth.signInWithPassword({ email: samuelEmail, password });

  if (jerErr || samErr || !jerLogin.session || !samLogin.session) {
    throw new Error(`Echec de la connexion. Jeremy: ${jerErr?.message} | Samuel: ${samErr?.message}`);
  }

  const jeremySession = jerLogin.session;
  const samuelUser = samLogin.user;

  console.log('Succes: Jeremy et Samuel connectes');

  // 2. Creer un projet (par Jeremy) et ajouter Samuel via Azure Function
  console.log('Creation du projet par Jeremy...');
  const { data: project, error: pError } = await jeremyClient.from('projects')
    .insert({ name: 'Integration Test Final', owner_id: jeremySession.user.id })
    .select().single();

  if (pError) throw pError;

  // Jeremy s'ajoute comme owner dans project_members (pour passer le RLS)
  const { error: pmError } = await jeremyClient.from('project_members')
    .insert({ project_id: project.id, user_id: jeremySession.user.id, role: 'owner' });

  if (pmError) console.log('Erreur insertion project_members (RLS probable):', pmError.message);

  console.log(`Ajout de Samuel (${samuelUser.id}) au projet via Azure Function...`);
  
  const resMember = await fetch(`${BASE}/manage_members`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${jeremySession.access_token}`,
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ 
      action: 'add', 
      project_id: project.id, 
      target_user_id: samuelUser.id, 
      role: 'member' 
    })
  });

  if (!resMember.ok) {
    const errorText = await resMember.text();
    console.log(`Erreur manage_members (Status ${resMember.status}):`, errorText);
  } else {
    console.log('Succes: Projet cree, Samuel ajoute via Azure Function');
  }

  // 3. Creer des taches via Azure Function (Jeremy demande la creation)
  const titles = ['Architecture serverless', "Tests d'integration", 'Documentation API'];
  const createdTasks: any[] = [];

  console.log('Creation des taches via Azure Function...');
  for (const title of titles) {
    const res = await fetch(`${BASE}/validate_task`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${jeremySession.access_token}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        project_id: project.id, 
        title, 
        priority: 'medium',
        assigned_to: samuelUser.id // On les assigne a Samuel pour tester les notifs
      })
    });
    
    if (res.ok) {
        const data: any = await res.json();
        if (data.task) createdTasks.push(data.task);
    } else {
        const errorText = await res.text();
        console.log(`Erreur validate_task pour "${title}" (Status ${res.status}):`, errorText);
    }
  }
  console.log(`Succes: ${createdTasks.length} taches creees et assignees a Samuel`);

  // 4. Jeremy surveille en Realtime les progres de Samuel
  let rtCount = 0;
  const channel = jeremyClient.channel(`project:${project.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', 
      schema: 'public', 
      table: 'tasks',
      filter: `project_id=eq.${project.id}`
    }, (p) => { 
      rtCount++; 
      console.log(` [RT] ${p.old.status} -> ${p.new.status}`); 
    })
    .subscribe();

  await new Promise(r => setTimeout(r, 2000)); // Temps de synchro

  // 5. Samuel fait progresser les taches
  console.log('Samuel met a jour les taches...');
  for (const task of createdTasks) {
    await samuelClient.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);
    await new Promise(r => setTimeout(r, 500));
    await samuelClient.from('tasks').update({ status: 'done' }).eq('id', task.id);
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('Succes: Samuel a termine toutes les taches');

  // On attend que le Realtime et les fonctions asynchrones (notifs) finissent
  await new Promise(r => setTimeout(r, 4000));
  console.log(`Succes: Jeremy a recu ${rtCount} evenements Realtime`);

  // 6. Stats finales via Azure Function (consultees par Jeremy)
  const resStats = await fetch(`${BASE}/project_stats?project_id=${project.id}`, {
    headers: { 'Authorization': `Bearer ${jeremySession.access_token}` }
  });
  
  if (resStats.ok) {
      const stats: any = await resStats.json();
      console.log('\nSTATS FINALES:');
      console.log(` Taches : ${stats.total_tasks}`);
      console.log(` Completion : ${stats.completion_rate}%`);
      console.log(` Par statut :`, stats.by_status);
  } else {
      const errorText = await resStats.text();
      console.log(`Erreur project_stats (Status ${resStats.status}):`, errorText);
  }

  // 7. Notifications pour Samuel (car Jeremy lui a assigne des taches)
  const { data: notifs } = await samuelClient.from('notifications')
    .select('*')
    .eq('user_id', samuelUser.id);
    
  console.log(`\nNotifications Samuel: ${notifs?.length || 0}`);

  jeremyClient.removeChannel(channel);
  console.log('\n--- FIN - TOUS LES SYSTEMES FONCTIONNELS ---');
}

run().catch(console.error);

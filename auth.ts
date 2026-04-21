import { supabase } from "./client.js";
import type { AuthResponse } from "@supabase/supabase-js";

export async function signUp(
  email: string,
  password: string,
  username: string,
  fullName: string,
): Promise<AuthResponse["data"]> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, full_name: fullName } },
  });

  if (error) throw error;

  if (data.user) {
    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      username,
      full_name: fullName,
    });
    if (profileError) throw profileError;
  }

  return data;
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthResponse["data"]> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  return data;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

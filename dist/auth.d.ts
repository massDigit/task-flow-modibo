import type { AuthResponse } from "@supabase/supabase-js";
export declare function signUp(email: string, password: string, username: string, fullName: string): Promise<AuthResponse["data"]>;
export declare function signIn(email: string, password: string): Promise<AuthResponse["data"]>;
export declare function signOut(): Promise<void>;
//# sourceMappingURL=auth.d.ts.map
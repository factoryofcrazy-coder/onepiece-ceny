"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { sb } from "./supabase";

export type Profile = { id: string; username: string | null };

type AuthState = { user: User | null; profile: Profile | null; loading: boolean; signOut: () => Promise<void> };

const Ctx = createContext<AuthState>({ user: null, profile: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sb().auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = sb().auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return setProfile(null);
    sb()
      .from("profiles")
      .select("id, username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data ?? { id: user.id, username: user.email?.split("@")[0] ?? null }));
  }, [user]);

  const signOut = async () => {
    await sb().auth.signOut();
  };

  return <Ctx.Provider value={{ user, profile, loading, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

let profilesCache: Promise<Profile[]> | null = null;
export function loadProfiles(): Promise<Profile[]> {
  if (!profilesCache)
    profilesCache = Promise.resolve(
      sb()
        .from("profiles")
        .select("id, username")
        .order("username")
        .then(({ data }) => (data as Profile[]) ?? []),
    );
  return profilesCache;
}

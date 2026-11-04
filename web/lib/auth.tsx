"use client";
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { sb } from "./supabase";

export type Profile = { id: string; username: string | null };

type AuthState = { user: User | null; profile: Profile | null; loading: boolean; signOut: () => Promise<void>; refreshProfile: () => Promise<void> };

const Ctx = createContext<AuthState>({ user: null, profile: null, loading: true, signOut: async () => {}, refreshProfile: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sb().auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = sb().auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      // odkaz z e-mailu „zabudnuté heslo“ – aj keby presmerovanie skončilo na inej stránke
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/nove-heslo") window.location.assign("/nove-heslo");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = user?.id;
  const refreshProfile = useCallback(async () => {
    if (!userId) return setProfile(null);
    const { data } = await sb().from("profiles").select("id, username").eq("id", userId).maybeSingle();
    profilesCache = null;
    setProfile(data ?? { id: userId, username: null });
  }, [userId]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const signOut = async () => {
    await sb().auth.signOut();
  };

  return <Ctx.Provider value={{ user, profile, loading, signOut, refreshProfile }}>{children}</Ctx.Provider>;
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function isPublicRoute(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/apply" ||
    pathname.startsWith("/apply/") ||
    pathname === "/client-review" ||
    pathname.startsWith("/client-review/")
  );
}

export default function RecruiterAuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const publicRoute = isPublicRoute(pathname);
  const [checking, setChecking] = useState(!publicRoute);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (publicRoute) {
      setChecking(false);
      return;
    }

    let active = true;
    setChecking(true);

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        router.replace("/login");
        return;
      }
      setChecking(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) router.replace("/login");
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [pathname, publicRoute, router, supabase]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  if (publicRoute) return <>{children}</>;

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-6 text-[#172536]">
        <p className="rounded-xl border border-[#dfe5eb] bg-white px-5 py-4 text-sm font-semibold shadow-sm">
          Checking recruiter access…
        </p>
      </main>
    );
  }

  return (
    <>
      {children}
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className="fixed bottom-5 left-5 z-50 rounded-lg border border-[#aebbc7] bg-white px-4 py-2 text-sm font-bold text-[#0b2239] shadow-lg disabled:opacity-60"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </>
  );
}

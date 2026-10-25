"use client";

// Shared-mode chrome: sign-in (email magic link, invitation only), the members'
// edit menu, and the gate shown on a private atlas to signed-out visitors.

import { useEffect, useRef, useState } from "react";
import { Camera, ChevronDown, History, Loader2, LogOut, Mail, MapPinned, Pencil, Route, UserRound, Lock, Users } from "lucide-react";
import { app, useApp, sendMagicLink, signOut } from "@/lib/store";
import { Button, cn, inputCls } from "@/components/ui";
import { Wordmark } from "@/components/TopBar";

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return { open, setOpen, ref };
}

export function SignInForm({ compact }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr("Enter a valid email address.");
    setState("sending");
    try {
      await sendMagicLink(email);
      setState("sent");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't send the link.");
      setState("idle");
    }
  };
  if (state === "sent")
    return (
      <p className="text-[12.5px] leading-relaxed text-fg">
        <Mail className="mr-1 inline size-4 text-ice" /> Check <strong>{email}</strong> and open the link on this device to sign in.
      </p>
    );
  return (
    <form onSubmit={submit} className="space-y-2">
      {!compact && <p className="text-[12px] text-fg-dim">Members only. Enter the email you were invited with — we&apos;ll send a one-time sign-in link.</p>}
      <input type="email" autoComplete="email" required className={inputCls} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
      {err && (
        <p role="alert" className="text-[12px] text-signal">
          {err}
        </p>
      )}
      <Button type="submit" variant="solid" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Email me a link
      </Button>
    </form>
  );
}

export function AccountButton() {
  const auth = useApp((s) => s.auth);
  const { open, setOpen, ref } = usePopover();
  const label = auth.status === "member" ? auth.name : auth.status === "loading" ? "…" : "Sign in";
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-1.5 border px-2 text-[12px]",
          auth.status === "member" ? "border-ice/40 text-ice" : "border-line text-fg-dim hover:text-fg",
        )}
      >
        <UserRound className="size-4" />
        <span className="hidden max-w-28 truncate sm:inline">{label}</span>
      </button>
      {open && (
        <div className="om-panel absolute top-10 right-0 z-50 w-72 animate-in p-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          {auth.status === "member" ? (
            <>
              <p className="text-[13px] text-fg">{auth.name}</p>
              <p className="mb-3 text-[11.5px] text-fg-faint">{auth.email} · member — your edits are saved for everyone.</p>
              <Button className="w-full" onClick={() => void signOut().then(() => setOpen(false))}>
                <LogOut className="size-3.5" /> Sign out
              </Button>
            </>
          ) : auth.status === "not_member" ? (
            <>
              <p className="mb-3 text-[12.5px] text-fg">{auth.email} isn&apos;t on the members list. Ask whoever runs the atlas to invite you.</p>
              <Button className="w-full" onClick={() => void signOut()}>
                <LogOut className="size-3.5" /> Sign out
              </Button>
            </>
          ) : (
            <SignInForm />
          )}
        </div>
      )}
    </div>
  );
}

/** Members' edit entry points. Hidden for everyone else. */
export function EditMenu() {
  const auth = useApp((s) => s.auth);
  const selection = useApp((s) => s.selection);
  const data = useApp((s) => s.data);
  const { open, setOpen, ref } = usePopover();
  if (auth.status !== "member") return null;
  const locId = selection?.type === "location" ? selection.id : selection?.type === "variant" ? data?.variants.find((v) => v.id === selection.id)?.locationId : undefined;
  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const item = "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-fg hover:bg-panel-2 disabled:opacity-40";
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-1.5 border border-line px-2.5 text-[12px] text-fg-dim hover:border-line-strong hover:text-fg"
      >
        <Pencil className="size-3.5" />
        <span className="hidden sm:inline">Edit</span>
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div role="menu" className="om-panel absolute top-10 right-0 z-50 w-64 animate-in shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          <button role="menuitem" className={item} onClick={() => go(() => app.set({ contribute: { kind: "edit_location" }, selection: null }))}>
            <MapPinned className="size-4 text-ice" /> New place
          </button>
          <button role="menuitem" className={item} onClick={() => go(() => app.set({ contribute: { kind: "edit_variant", locationId: locId ?? undefined } }))}>
            <Route className="size-4 text-ice" /> New route{locId ? " at this place" : ""}
          </button>
          <button
            role="menuitem"
            className={item}
            onClick={() =>
              go(() =>
                app.set({
                  contribute: {
                    kind: "edit_poi",
                    parent: selection && selection.type !== "poi" ? { type: selection.type, id: selection.id } : undefined,
                  },
                }),
              )
            }
          >
            <MapPinned className="size-4 text-ice" /> New spot
          </button>
          <button
            role="menuitem"
            className={item}
            disabled={!selection}
            onClick={() => go(() => selection && app.set({ contribute: { kind: "add_media", target: selection } }))}
          >
            <Camera className="size-4 text-ice" /> Add a photo{selection ? "" : " (open a place first)"}
          </button>
          <div className="h-px bg-line" />
          <button role="menuitem" className={item} onClick={() => go(() => app.set({ contribute: { kind: "history" }, selection: null }))}>
            <History className="size-4 text-fg-dim" /> History & undo
          </button>
          {auth.owner && (
            <button role="menuitem" className={item} onClick={() => go(() => app.set({ contribute: { kind: "members" }, selection: null }))}>
              <Users className="size-4 text-fg-dim" /> Members
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Private atlas + signed out: explain and offer sign-in instead of an empty map. */
export function PrivateGate() {
  const auth = useApp((s) => s.auth);
  const publicRead = useApp((s) => s.publicRead);
  const loadError = useApp((s) => s.loadError);
  if (auth.status === "disabled" || auth.status === "member" || auth.status === "loading" || publicRead) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-ink/70 px-4 backdrop-blur-sm">
      <div className="om-panel om-ticks w-full max-w-sm p-5">
        <div className="mb-1 flex items-center gap-2 text-ice">
          <Lock className="size-4" /> <span className="om-label text-ice">Private atlas</span>
        </div>
        <h2 className="mb-4">
          <Wordmark className="h-[84px] w-[224px]" />
        </h2>
        {auth.status === "not_member" ? (
          <p className="text-[12.5px] text-fg">
            {auth.email} isn&apos;t on the members list yet. Ask whoever runs the atlas to invite you, then reload.
          </p>
        ) : (
          <SignInForm />
        )}
        {loadError && <p className="mt-3 text-[11.5px] text-signal">{loadError}</p>}
      </div>
    </div>
  );
}

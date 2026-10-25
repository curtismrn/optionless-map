"use client";

// Owner-only: invite and remove members. The database checks the owner role in
// every call (list_people / invite_member / remove_member, migration 0002).

import { useEffect, useState } from "react";
import { AlertTriangle, Crown, Loader2, UserPlus, Users, X } from "lucide-react";
import { useApp, toast } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { PanelShell } from "@/components/PanelShell";
import { Header } from "@/components/ContributePanel";
import { Button, Field, inputCls } from "@/components/ui";

interface Person {
  email: string;
  display_name: string;
  role: "owner" | "member";
  status: "member" | "invited";
  since: string;
}

export function MembersPanel() {
  const isOwner = useApp((s) => s.auth.status === "member" && s.auth.owner);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase().rpc("list_people");
    if (error) setErr(error.message);
    else setPeople(data as Person[]);
  };
  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const addr = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return setErr("Enter a valid email address.");
    setBusy("invite");
    const { data, error } = await supabase().rpc("invite_member", { p_email: addr, p_name: name.trim() });
    setBusy(null);
    if (error) return setErr(error.message);
    toast(data === "member" ? `${addr} is a member now.` : `${addr} is invited — they can sign in with “Email me a link”.`);
    setEmail("");
    setName("");
    void load();
  };

  const remove = async (p: Person) => {
    const what = p.status === "invited" ? `Cancel the invite for ${p.email}?` : `Remove ${p.display_name} (${p.email})? They lose access right away. Their places and photos stay.`;
    if (!window.confirm(what)) return;
    setErr("");
    setBusy(p.email);
    const { error } = await supabase().rpc("remove_member", { p_email: p.email });
    setBusy(null);
    if (error) return setErr(error.message);
    toast(p.status === "invited" ? "Invite cancelled." : `${p.display_name} removed.`);
    void load();
  };

  const members = people?.filter((p) => p.status === "member") ?? [];
  const invited = people?.filter((p) => p.status === "invited") ?? [];

  return (
    <PanelShell label="Members">
      <Header kicker="Owner" title="Members" />
      {!isOwner ? (
        <p className="p-3 text-[12px] text-fg-dim">Only the atlas owner can manage members.</p>
      ) : (
        <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
          <form onSubmit={invite} className="space-y-2 border-b border-line p-3">
            <Field label="Email">
              <input type="email" className={inputCls} placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Display name (optional)">
              <input className={inputCls} maxLength={40} placeholder="Defaults to the start of the email" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" variant="solid" className="w-full" disabled={busy !== null}>
              {busy === "invite" ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />} Invite
            </Button>
            <p className="text-[11px] leading-snug text-fg-faint">No email is sent from here: tell them to open the site and use “Email me a link” with this address.</p>
          </form>
          {err && (
            <p role="alert" className="m-3 flex gap-1.5 border border-signal/40 bg-signal/5 px-2.5 py-2 text-[12px] text-signal">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {err}
            </p>
          )}
          {!people && !err && (
            <p className="flex items-center gap-2 px-3 py-6 text-[12px] text-fg-faint">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </p>
          )}
          {people && (
            <>
              <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
                <Users className="size-3.5 text-fg-faint" />
                <span className="om-label">Members · {members.length}</span>
              </div>
              <ul>{members.map((p) => <Row key={p.email} p={p} busy={busy === p.email} onRemove={remove} />)}</ul>
              {invited.length > 0 && (
                <>
                  <div className="px-3 pt-3 pb-1">
                    <span className="om-label">Invited, not signed in yet · {invited.length}</span>
                  </div>
                  <ul>{invited.map((p) => <Row key={p.email} p={p} busy={busy === p.email} onRemove={remove} />)}</ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </PanelShell>
  );
}

function Row({ p, busy, onRemove }: { p: Person; busy: boolean; onRemove: (p: Person) => void }) {
  return (
    <li className="flex items-center gap-3 border-b border-line/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-[13px] text-fg">
          {p.role === "owner" && <Crown className="size-3.5 shrink-0 text-amber" />}
          {p.display_name}
        </div>
        <div className="truncate text-[11px] text-fg-faint">{p.email}</div>
      </div>
      {p.role !== "owner" && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(p)} title={p.status === "invited" ? "Cancel invite" : "Remove member"}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />} {p.status === "invited" ? "Cancel" : "Remove"}
        </Button>
      )}
    </li>
  );
}

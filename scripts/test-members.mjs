// Checks the owner-managed membership rules (migration 0002) inside a
// transaction that is always rolled back: nothing is left in the database.
//
//   node scripts/test-members.mjs

import postgres from "postgres";
import { loadEnv } from "./env.mjs";

const env = loadEnv();
const m = /^(postgres(?:ql)?:\/\/)([^:/@]+):(.*)@([^@]+)$/.exec(env.SUPABASE_DB_URL.trim());
let pass = m[3];
try {
  pass = decodeURIComponent(pass);
} catch {
  /* literal % */
}
const sql = postgres(`${m[1]}${m[2]}:${encodeURIComponent(pass)}@${m[4]}`, { ssl: "require", max: 1, onnotice: () => {} });

let ok = 0;
let bad = 0;
const check = (name, cond) => (cond ? ok++ : bad++, console.log(`${cond ? "✓" : "✗"} ${name}`));
const fails = async (tx, q) => {
  await tx`savepoint t`;
  try {
    await q();
    await tx`release savepoint t`;
    return false;
  } catch {
    await tx`rollback to savepoint t`;
    return true;
  }
};
const as = (tx, uid) => tx.unsafe(`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true)`);
const asAdmin = (tx) => tx.unsafe("reset role");

try {
  await sql.begin(async (tx) => {
    const owners = await tx`select user_id, email from public.members where role = 'owner'`;
    check("exactly one owner", owners.length === 1);
    const owner = owners[0].user_id;
    const stranger = "stranger-" + Date.now() + "@example.com";
    const friend = "friend-" + Date.now() + "@example.com";

    check("uninvited email can't create an account", await fails(tx, () => tx`insert into auth.users (id, email) values (gen_random_uuid(), ${stranger})`));

    await as(tx, owner);
    const r = await tx`select public.invite_member(${friend}, 'Test Friend') as r`;
    check("owner invites a new email → 'invited'", r[0].r === "invited");
    const people = await tx`select * from public.list_people()`;
    check("invite listed as pending", people.some((p) => p.email === friend && p.status === "invited"));
    check("owner can't remove themself", await fails(tx, () => tx`select public.remove_member(${owners[0].email})`));

    await asAdmin(tx);
    const [u] = await tx`insert into auth.users (id, email) values (gen_random_uuid(), ${friend}) returning id`;
    const mem = await tx`select display_name, role from public.members where user_id = ${u.id}`;
    check("invited email's account becomes a member", mem[0]?.display_name === "Test Friend" && mem[0]?.role === "member");
    check("invite consumed", (await tx`select 1 from public.invites where email = ${friend}`).length === 0);

    await as(tx, u.id);
    check("plain member can't list people", await fails(tx, () => tx`select * from public.list_people()`));
    check("plain member can't invite", await fails(tx, () => tx`select public.invite_member('x@example.com', 'x')`));
    check("plain member can't write members directly", await fails(tx, () => tx`update public.members set role = 'owner' where user_id = ${u.id}`));

    await as(tx, owner);
    await tx`select public.remove_member(${friend})`;
    await asAdmin(tx);
    check("owner removes a member", (await tx`select 1 from public.members where user_id = ${u.id}`).length === 0);

    throw new Error("rollback");
  });
} catch (e) {
  if (e.message !== "rollback") {
    console.error("error:", e.message);
    bad++;
  }
} finally {
  await sql.end();
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);

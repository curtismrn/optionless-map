// Run the app in local demo mode (seed data, no Supabase) on port 3001,
// even when .env.local points at the shared atlas. For design work.
import { spawn } from "node:child_process";

const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" };
const child = spawn("npx", ["next", "dev", "--port", "3001"], { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));

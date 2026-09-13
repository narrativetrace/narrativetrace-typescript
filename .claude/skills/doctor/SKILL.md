---
name: doctor
description: "Diagnoses a NarrativeTrace TypeScript install and configuration. Use when nothing is being traced, traces aren't showing up, the vitest config crashes on load, parameter names render as arg0/arg1, or you are not sure NarrativeTrace is wired up correctly. Checks Node/vitest-peer/sibling-package versions, the /reporters subpath, traceObject option shapes, NARRATIVETRACE_OUTPUT, whether any consumer is attached to a traced proxy, whether redaction is proven in a test, and stale approval-trace diffs. Read-only — makes no changes. Say 'check my narrativetrace setup', 'is narrativetrace broken', or 'why isn't anything being traced' to invoke it."
when_to_use: "A project already has NarrativeTrace installed and something about it is not working, or an agent wants a pre-flight check before wiring it into new code."
allowed-tools: pnpm, npx, node
---

# narrativetrace-doctor

## 1. Run the doctor and read its report

```bash
npx narrativetrace doctor || true
```

**verify:** `npx narrativetrace doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(r.findings)||r.findings.length!==11) process.exit(1);"`

**failure:** the CLI's JSON output does not parse, or is missing findings — the CLI crashed instead of reporting a finding. Fix: re-run `npx narrativetrace doctor --json` directly and read the raw output — a crash here is a doctor bug, never a project finding

## 2. Prove redaction in a test

```bash
node -e "console.log('Render a call with a deny-listed parameter name (e.g. password or token) in a test and assert the output contains [REDACTED], and that a neighboring non-sensitive value is still present.')"
```

**verify:** `npx narrativetrace doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); const f=r.findings.find(x=>x.id==='trap.redaction-proof'); if(!f||(f.status!=='pass'&&f.status!=='fail')) process.exit(1);"`

**failure:** a redaction primitive is imported but never asserted on — trusting redaction by inspection instead of proving it in a test. Fix: render a call with a deny-listed parameter name and assert the output contains "[REDACTED]"

## 3. Read the rendered trace before asserting

```bash
node -e "const fs=require('fs'),path=require('path');function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?walk(p):[p];});}const files=walk('narrativetrace-output').filter(f=>f.endsWith('.md'));if(!files.length){console.error('no rendered .md file found under narrativetrace-output');process.exit(1);}const newest=files.map(f=>[f,fs.statSync(f).mtimeMs]).sort((a,b)=>b[1]-a[1])[0][0];console.log(newest);console.log(fs.readFileSync(newest,'utf8'));"
```

## 4. Approval flow: diff the structural trace, not just values

**Flagged:** unstudied — eval cell pending

```bash
node -e "const fs=require('fs'),path=require('path');function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?walk(p):[p];});}const dir='narrativetrace-output';const received=walk(dir).filter(f=>f.endsWith('.received.nt'));if(received.length){const newest=received.map(f=>[f,fs.statSync(f).mtimeMs]).sort((a,b)=>b[1]-a[1])[0][0];const approved=newest.slice(0,-'.received.nt'.length)+'.approved.nt';console.log('received: '+newest);if(fs.existsSync(approved)){console.log('approved: '+approved);console.log(fs.readFileSync(approved,'utf8'));console.log('--- vs received ---');console.log(fs.readFileSync(newest,'utf8'));}else{console.log('no .approved.nt yet - first approval, review then promote');console.log(fs.readFileSync(newest,'utf8'));}}else{const nt=walk(dir).filter(f=>f.endsWith('.nt'));if(!nt.length){console.error('no structural .nt file found under narrativetrace-output');process.exit(1);}const newest=nt.map(f=>[f,fs.statSync(f).mtimeMs]).sort((a,b)=>b[1]-a[1])[0][0];console.log('no .received.nt pending; newest structural trace: '+newest);console.log(fs.readFileSync(newest,'utf8'));}"
```

## Always

- Run the doctor CLI and read its report before making any change. (the tested tooling already computed the finding — re-deriving it by hand risks disagreeing with what ships)

## Never

- Never have this skill edit, generate, or delete a file. (narrativetrace-doctor is scoped read-only by design — generation of the redaction-proof test itself is a separate, later skill)
- Never claim a finding passed without having run the doctor CLI in this session. (self-reported success overstates reality — a build claimed green that does not reproduce from clean is not evidence; verify is never 'ask the agent')

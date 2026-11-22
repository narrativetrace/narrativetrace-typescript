# narrativetrace-typescript

The NarrativeTrace agent skills for TypeScript. This plugin carries 7 skills and nothing else: no hooks, no MCP servers, no executables. Each skill is a page of instructions that Claude follows in your TypeScript project, using your own package manager and Claude Code's normal permission prompts.

Install it from this repository's marketplace:

```
/plugin marketplace add narrativetrace/narrativetrace-typescript
/plugin install narrativetrace-typescript@narrativetrace-typescript
```

## Skills

- `narrativetrace-doctor`: Diagnoses a NarrativeTrace TypeScript install and configuration.
- `add-narrative-tracing`: Installs NarrativeTrace into a TypeScript project and gets it to a first trace.
- `narrativetrace-feedback`: Reports a defect in NarrativeTrace itself — the library, the doctor, an agent skill, or the published install prompt.
- `add-narrativetrace-clarity`: Adds or verifies NarrativeTrace Clarity in a TypeScript Vitest project.
- `narrativetrace-verify`: Verifies a change in a TypeScript project by reading what the code actually did before saying it is done.
- `narrativetrace-debug`: Finds the cause of a wrong result in a TypeScript project by reading what the code did with the values, not by stepping through it.
- `narrativetrace-explain`: Use when someone asks what an application or a flow actually does, with nothing broken and no change needing verification.

## What the skills run

The plugin pre-approves no command. The first time a skill runs one of these in your project, Claude Code asks you. Every command is listed here exactly as the skills spell it.

- `pnpm`, to add the NarrativeTrace packages to your project and to check the install with a clean, frozen-lockfile install. `pnpm add` edits your `package.json` and lockfile:

```
pnpm add @narrativetrace/core-node @narrativetrace/proxy
pnpm install --frozen-lockfile
pnpm add @narrativetrace/pino pino
```

- `npx`, to run the NarrativeTrace command line, your own test runner and the two commands the NarrativeTrace packages put in your project. `init --dry-run` only previews an install and writes nothing. `feedback draft` writes the two report files described below. Applying an install and promoting an approval baseline with `narrativetrace-approve` are separate steps that wait for your yes:

```
npx @narrativetrace/cli doctor || true
npx @narrativetrace/cli init --dry-run
npx @narrativetrace/cli feedback draft --category <category> --step "<where it happened>" --did "<what you did>" --happened "<what happened>" --expected "<what you expected>"
npx @narrativetrace/cli feedback url --category <category> --step "<where it happened>" --did "<what you did>" --happened "<what happened>" --expected "<what you expected>"
npx vitest run
npx narrativetrace-clarity --input narrativetrace-output/clarity-results.json --output-dir narrativetrace-output --min-score 0.8 --max-high-issues 0
npx vitest run <the smallest test that drives the real path>
npx narrativetrace-approve
npx vitest run <the test that reproduces the symptom>
npx vitest run <the test that exercises the flow you were asked about>
```

- `git`, to read what changed in your project:

```
git status --short
```

- `node -e`, short scripts that print a reminder or read files in your project and print them: the traces and reports under `narrativetrace-output/` and `narratives/`, and your `package.json`:

```
node -e "console.log('Render a call with a deny-listed parameter name (e.g. password or token) in a test and assert the output contains [REDACTED], and that a neighboring non-sensitive value is still present.')"
node -e "const fs=require('fs'),path=require('path');function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?walk(p):[p];});}const files=walk('narrativetrace-output').filter(f=>f.endsWith('.md')&&!f.split(path.sep).includes('feedback'));if(!files.length){console.error('no rendered .md file found under narrativetrace-output');process.exit(1);}const newest=files.map(f=>[f,fs.statSync(f).mtimeMs]).sort((a,b)=>b[1]-a[1])[0][0];console.log(newest);console.log(fs.readFileSync(newest,'utf8'));"
node -e "const fs=require('fs'),path=require('path');function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?walk(p):[p];});}const dir='narrativetrace-output';const received=walk(dir).filter(f=>f.endsWith('.received.nt'));if(received.length){const newest=received.map(f=>[f,fs.statSync(f).mtimeMs]).sort((a,b)=>b[1]-a[1])[0][0];const approved=newest.slice(0,-'.received.nt'.length)+'.approved.nt';console.log('received: '+newest);if(fs.existsSync(approved)){console.log('approved: '+approved);console.log(fs.readFileSync(approved,'utf8'));console.log('--- vs received ---');console.log(fs.readFileSync(newest,'utf8'));}else{console.log('no .approved.nt yet - first approval, review then promote');console.log(fs.readFileSync(newest,'utf8'));}}else{const nt=walk(dir).filter(f=>f.endsWith('.nt'));if(!nt.length){console.error('no structural .nt file found under narrativetrace-output');process.exit(1);}const newest=nt.map(f=>[f,fs.statSync(f).mtimeMs]).sort((a,b)=>b[1]-a[1])[0][0];console.log('no .received.nt pending; newest structural trace: '+newest);console.log(fs.readFileSync(newest,'utf8'));}"
node -e "process.stdout.write(require('fs').readFileSync('narrativetrace-output/feedback/feedback-draft.md','utf8'));"
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(JSON.stringify({scripts:p.scripts,dependencies:p.dependencies,devDependencies:p.devDependencies},null,2));"
node -e "const r=JSON.parse(require('fs').readFileSync('narrativetrace-output/clarity-results.json','utf8')); for(const s of r.scenarios){console.log(s.name+': overall '+s.overallScore+' (method '+s.methodNameScore+', parameter '+s.parameterNameScore+', class '+s.classNameScore+', structural '+s.structuralScore+', cohesion '+s.cohesionScore+')'); for(const i of s.issues) console.log('  '+i.severity+' '+i.category+' '+i.element+' - '+i.suggestion);}"
node -e "const fs=require('fs'),path=require('path');const skip=[];function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('narrativetrace-output/structural').filter(f=>f.endsWith('.nt')).sort()){console.log(f);}"
node -e "const fs=require('fs'),path=require('path');const skip=['structural','feedback'];function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('narrativetrace-output').filter(f=>f.endsWith('.md')).sort()){console.log(f);}"
node -e "const fs=require('fs'),path=require('path');const skip=[];function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('narratives').filter(f=>f.endsWith('.received.nt')).sort()){console.log(f);console.log(fs.readFileSync(f,'utf8'));}"
node -e "const fs=require('fs'),path=require('path');const skip=[];function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('narrativetrace-output/diagrams').filter(f=>f.endsWith('.mmd')).sort()){console.log(f);}"
```

One `node -e` script writes. It changes your `package.json` and nothing else:

```
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.type='module';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
```

Two skills also edit your project's files. The install skill adds the NarrativeTrace packages to your `package.json` and shows a first trace in a small script or test; the Clarity skill registers its reporter in your Vitest config and, only when you ask, wires a gate into your package scripts.

## What the skills fetch

- The skills pin no NarrativeTrace version and look nothing up themselves: they install without a version, so your package manager resolves the newest release from the npm registry, as it resolves any dependency. The packages they add are `@narrativetrace/core-node`, `@narrativetrace/pino`, `@narrativetrace/proxy`.
- `npx @narrativetrace/cli` downloads the NarrativeTrace command line from the npm registry the first time it runs, if your project does not already have it.
- Your own package manager then resolves what those packages depend on. The skills fetch nothing else.

## What the skills send

Nothing leaves your machine from this plugin: no skill uploads, posts or transmits anything, and it has no hooks, MCP servers or network code of its own.

`narrativetrace-feedback` is the one skill about reporting a defect in NarrativeTrace itself. It drafts a report from your project into `narrativetrace-output/feedback/feedback-draft.md` and `narrativetrace-output/feedback/feedback-body.md` (the install coordinates, the doctor's JSON report and at most one structural trace, and it refuses to write a report that carries a value from your own run), shows you the whole draft, and asks once whether to file it. Only after your yes does it print a pre-filled issue address (https://github.com/narrativetrace/narrativetrace-typescript/issues/new?...) and the name of the body file to paste. It never opens that address, never runs the command it prints, and never runs `gh`: nothing is sent unless you open the address yourself, in your own browser, under your own account, and the issue you file is public.

## License and links

The skills in this plugin are licensed under Apache-2.0.

- Homepage: https://narrativetrace.ai
- Repository: https://github.com/narrativetrace/narrativetrace-typescript

NarrativeTrace is provided as is: no warranty, and no guarantee that it fits your purpose. Use it at your own risk.

The Apache-2.0 text, [LICENSE-APACHE](https://github.com/narrativetrace/narrativetrace-typescript/blob/main/LICENSE-APACHE), section 7:

> 7. Disclaimer of Warranty. Unless required by applicable law or
> agreed to in writing, Licensor provides the Work (and each
> Contributor provides its Contributions) on an "AS IS" BASIS,
> WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
> implied, including, without limitation, any warranties or conditions
> of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
> PARTICULAR PURPOSE. You are solely responsible for determining the
> appropriateness of using or redistributing the Work and assume any
> risks associated with Your exercise of permissions under this License.

Section 8, "Limitation of Liability", of the same file limits liability further (Apache-licensed parts only).

The NarrativeTrace runtime that these skills install is licensed under the Business Source License 1.1; see [LICENSE](https://github.com/narrativetrace/narrativetrace-typescript/blob/main/LICENSE).

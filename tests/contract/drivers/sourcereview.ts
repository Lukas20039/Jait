/** Reference calls only. Rust owns expected values, verdicts, and mutation controls. */
import { homedir } from 'node:os';
// Preload Bun's node:crypto shim before simulating a host without global crypto.
import { webcrypto } from 'node:crypto';
import { join } from 'node:path';
import type * as Jose from '../../../packages/gateway/node_modules/jose/dist/types/index.d.ts';
const jose: typeof Jose = await import(new URL('../../../packages/gateway/node_modules/jose/dist/webapi/index.js', import.meta.url).href);
import { readFileSync } from 'node:fs';

// Every dynamically loaded module sees an isolated fixture environment.
process.env.__JAIT_CLI = '1';

// Exact reviewed inventory. Mutations redirect one entry to an isolated source copy.
export const sources: Record<string, string> = {
  subscriptionFetchers: '../../../packages/gateway/src/services/subscription-usage-fetchers.ts',
  messengerBridge: '../../../packages/gateway/src/services/messenger-bridge.ts',
  maintenanceRoutes: '../../../packages/gateway/src/routes/maintenance.ts',
  screenShareRoutes: '../../../packages/gateway/src/routes/screen-share.ts',
  pluginRoutes: '../../../packages/gateway/src/routes/plugins.ts',
  agentControlRoutes: '../../../packages/gateway/src/routes/agent-control.ts',
  smokeProcess: '../../../packages/gateway/scripts/smoke-process.mjs',
  surfaceTools: '../../../packages/gateway/src/tools/surface-tools.ts',
  osResolver: '../../../packages/gateway/src/os-control/resolver.ts',
  installRuntimeScript: '../../../packages/gateway/bin/install-runtime.mjs',
  bundleMessengerScript: '../../../packages/gateway/scripts/bundle-messenger-runtime.mjs',
  bundleWebScript: '../../../packages/gateway/scripts/bundle-web.mjs',
  compileCacheScript: '../../../packages/gateway/bin/compile-cache.mjs',
  sqlTool: '../../../packages/gateway/src/tools/session-sql-tools.ts',
  cronTools: '../../../packages/gateway/src/tools/cron-tools.ts',
  decisionTool: '../../../packages/gateway/src/tools/decision.ts',
  agentWrapper: '../../../packages/gateway/src/tools/core/agent.ts',
  pluginSdk: '../../../packages/gateway/src/plugins/contracts.ts',
  foundationBarrel: '../../../packages/gateway/src/foundation.ts',
  ollamaSetup: '../../../packages/gateway/src/services/ollama-usage-setup.ts',
  maintenanceTool: '../../../packages/gateway/src/tools/maintenance-tools.ts',
  networkResources: '../../../packages/gateway/src/services/network-resources.ts',
  nodeState: '../../../packages/gateway/src/services/node-state-manager.ts',
  transfer: '../../../packages/gateway/src/services/project-transfer.ts',
  notification: '../../../packages/gateway/src/services/chat-notification.ts',
  messenger: '../../../packages/gateway/src/tools/messenger-tools.ts',
  matrixBarrel: '../../../packages/gateway/src/services/messenger-matrix-runtime.ts',
  mcpConfig: '../../../packages/gateway/src/providers/jait-mcp.ts',
  usageCache: '../../../packages/gateway/src/services/usage-refresh-cache.ts',
  link: '../../../packages/gateway/src/tools/link-tools.ts',
  ownerRuntime: '../../../packages/gateway/src/security/agent-sandbox-owner.ts',
  mount: '../../../packages/gateway/src/security/worktree-sandbox.ts',
  mobile: '../../../packages/gateway/src/tools/mobile-tools.ts',
  diagram: '../../../packages/gateway/src/tools/diagram-tools.ts',
  output: '../../../packages/gateway/src/surfaces/terminal-output.ts',
  emailBarrel: '../../../packages/gateway/src/services/email/index.ts',
  calendarBarrel: '../../../packages/gateway/src/services/calendar/index.ts',
  dbBarrel: '../../../packages/gateway/src/db/index.ts',
  providerBarrel: '../../../packages/gateway/src/providers/index.ts',
  osBarrel: '../../../packages/gateway/src/os-control/index.ts',
  surfaceBarrel: '../../../packages/gateway/src/surfaces/index.ts',
  securityBarrel: '../../../packages/gateway/src/security/index.ts',
  coreBarrel: '../../../packages/gateway/src/tools/core/index.ts',
  voice: '../../../packages/gateway/src/tools/voice-tools.ts',
  editor: '../../../packages/gateway/src/tools/project-editor-tools.ts',
  lists: '../../../packages/gateway/src/tools/list-preview.ts',
  swarm: '../../../packages/gateway/src/tools/swarm-mailbox.ts',
  control: '../../../packages/gateway/src/security/control-access.ts',
  trust: '../../../packages/gateway/src/routes/trust.ts',
  hooks: '../../../packages/gateway/src/routes/hooks.ts',
  surface: '../../../packages/gateway/src/surfaces/project-ui-sync.ts',
  lease: '../../../packages/gateway/src/security/assessment-lease.ts',
  ownership: '../../../packages/gateway/src/security/ownership.ts',
  state: '../../../packages/gateway/src/state-directory.ts',
  crypto: '../../../packages/gateway/src/crypto-polyfill.ts',
  inline: '../../../packages/gateway/src/services/email/inline-images.ts',
  preview: '../../../packages/gateway/src/security/preview-token.ts',
  origin: '../../../packages/gateway/src/security/request-origin.ts',
  git: '../../../packages/gateway/src/routes/git-node-routing.ts',
  shell: '../../../packages/gateway/src/tools/shell-prompt.ts',
  headers: '../../../packages/gateway/src/services/llm-headers.ts',
  cron: '../../../packages/gateway/src/scheduler/cron.ts',
  devices: '../../../packages/gateway/src/services/device-registry.ts',
  uuid: '../../../packages/gateway/src/lib/uuidv7.ts',
  dbuuid: '../../../packages/gateway/src/db/uuidv7.ts',
  apiTypes: '../../../packages/gateway/src/api-contracts.ts',
  channelTypes: '../../../packages/gateway/src/channels/types.ts',
  memoryTypes: '../../../packages/gateway/src/memory/contracts.ts',
  osTypes: '../../../packages/gateway/src/os-control/types.ts',
  providerTypes: '../../../packages/gateway/src/providers/contracts.ts',
  schedulerTypes: '../../../packages/gateway/src/scheduler/contracts.ts',
  securityTypes: '../../../packages/gateway/src/security/contracts.ts',
  calendarTypes: '../../../packages/gateway/src/services/calendar/types.ts',
  emailTypes: '../../../packages/gateway/src/services/email/types.ts',
  sessionTypes: '../../../packages/gateway/src/sessions/contracts.ts',
  surfaceTypes: '../../../packages/gateway/src/surfaces/contracts.ts',
  toolTypes: '../../../packages/gateway/src/tools/contracts.ts',
  skills: '../../../packages/gateway/src/skills/index.ts',
  modelResult: '../../../packages/gateway/src/tools/model-result.ts',
  usage: '../../../packages/gateway/src/providers/usage.ts',
};

export async function dispatch(call: any): Promise<unknown> {
  const specifier = sources[call.module];
  if (!specifier) throw new Error('unreviewed source');
  if (call.op === 'sourcereview.erased') {
    const { default: ts } = await import('typescript');
    const source = readFileSync(new URL(specifier, import.meta.url), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText.trim();
    return { emitted: output, exports: Object.keys(await import(specifier)).sort() };
  }
  if (call.op === 'sourcereview.crypto') {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const sentinel = { sentinel: true };
    try {
      if (call.present) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: sentinel });
      else Reflect.deleteProperty(globalThis, 'crypto');
      await import(specifier);
      return { present: typeof globalThis.crypto !== 'undefined', preserved: call.present ? (globalThis.crypto as unknown) === sentinel : null,
        random: typeof globalThis.crypto?.getRandomValues === 'function', installed: call.present ? null : globalThis.crypto === webcrypto };
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  }
  if (call.op === 'sourcereview.uuid') {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const now = Date.now;
    try {
      Date.now = () => call.now;
      if (call.fallback) Reflect.deleteProperty(globalThis, 'crypto');
      else Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues(array: Uint8Array) { array.fill(call.byte); return array; } } });
      const m = await import(specifier);
      const value = m[call.action ? 'newActionId' : 'uuidv7']();
      return call.fallback ? { prefix: value.slice(0, 13), format: /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value) } : value;
    } finally { Date.now = now; if (original) Object.defineProperty(globalThis, 'crypto', original); }
  }
  if (call.op === 'sourcereview.notificationGenerate') {
    const { mock } = await import('bun:test');
    const calls: unknown[] = [];
    // Only the external completion boundary is substituted; production request
    // construction, timeout cleanup, normalization and fallback stay intact.
    mock.module(new URL('packages/gateway/src/services/jait-llm.ts', new URL('../../../', import.meta.url)).pathname, () => ({
      async callJaitLlmCompletion(config: unknown, messages: unknown, options: any) {
        calls.push({ config, messages, maxTokens: options.maxTokens, temperature: options.temperature, aborted: options.signal.aborted });
        if (call.fail) throw new Error('fixture completion failed');
        return call.raw;
      },
    }));
    try {
      const subject = await import(specifier);
      const result = await subject.generateChatNotificationDetail({task:call.task, response:call.response, llm:{fixture:'runtime'}});
      return {result,calls};
    } finally { mock.restore(); }
  }
  if (call.op === 'sourcereview.agentWrapper') {
    const {mock}=await import('bun:test');
    const deps={fixture:'deps'},context={sessionId:'fixture',projectRoot:'fixture'},result={ok:true,message:'inner result'};
    let actualDeps:unknown,actualInput:unknown,actualContext:unknown;
    const calls:unknown[]=[];
    mock.module(new URL('packages/gateway/src/tools/agent-tools.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      createAgentSpawnTool(received:unknown){actualDeps=received;return {async execute(input:unknown,ctx:unknown){actualInput=input;actualContext=ctx;calls.push(input,ctx);if(call.fail)throw new Error('inner rejected');return result;}};}
    }));
    try{
      const subject=await import(specifier);const tool=subject.createAgentTool(deps);
      let returned,error;try{returned=await tool.execute(call.input,context);}catch(e){error=(e as Error).message;}
      return {name:tool.name,tier:tool.tier,category:tool.category,source:tool.source,required:tool.parameters.required,properties:Object.keys(tool.parameters.properties).sort(),depsIdentity:deps===actualDeps,inputIdentity:call.input===actualInput,contextIdentity:context===actualContext,calls,...(error?{error}:{resultIdentity:returned===result,result:returned})};
    }finally{mock.restore();}
  }
  if (call.op === 'sourcereview.decisionTool') {
    const {mock}=await import('bun:test');const calls:unknown[]=[];const signal=new AbortController().signal;
    mock.module(new URL('packages/gateway/src/services/system-one.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      async evaluateDecision(keys:unknown,state:unknown,questions:unknown,received:unknown){calls.push({keys,state,questions,sameSignal:received===signal});if(call.fail)throw new Error('decision failed');return call.response;}
    }));
    try{const subject=await import(specifier);return {result:await subject.createDecisionEvaluateTool().execute(call.input,{apiKeys:{fixture:'key'},signal}),calls};}finally{mock.restore();}
  }
  if(call.op==='sourcereview.script') {
    const fs=await import('node:fs');const path=await import('node:path');const cp=await import('node:child_process');
    const base=fs.mkdtempSync(path.join(new URL('../../../', import.meta.url).pathname,'.jait/artifacts/source-review','script-'));
    const node='/usr/bin/node',root=path.join(base,'project/packages/gateway'),home=path.join(base,'home'),bin=path.join(base,'bin');
    fs.mkdirSync(home,{recursive:true});fs.mkdirSync(bin);
    const env:NodeJS.ProcessEnv={PATH:bin,HOME:home,LANG:'C.UTF-8',__JAIT_CLI:'1'};
    const normalize=(text:string)=>text.replaceAll(base,'ROOT');
    try{
      const relative=call.module==='compileCacheScript'||call.module==='installRuntimeScript'?'bin/subject.mjs':'scripts/subject.mjs';
      const subject=path.join(root,relative);fs.mkdirSync(path.dirname(subject),{recursive:true});
      fs.writeFileSync(subject,fs.readFileSync(new URL(specifier,import.meta.url)));
      if(call.module==='compileCacheScript') {
        if(call.variant==='explicit')env.NODE_COMPILE_CACHE=path.join(base,'explicit');
        if(['state','empty','explicit'].includes(call.variant))env.JAIT_STATE_DIR=' '+path.join(base,'state')+' ';
        if(call.variant==='empty')env.NODE_COMPILE_CACHE='';
        const program="import {pathToFileURL} from 'node:url';import * as mod from 'node:module';await import(pathToFileURL(process.argv[1]).href);const cache=process.env.NODE_COMPILE_CACHE;const actual=mod.getCompileCacheDir?.();process.stdout.write(JSON.stringify({cache,cacheActive:typeof actual==='string'&&(actual===cache||actual.startsWith(cache+'/'))}));";
        const result=cp.spawnSync(node,['--input-type=module','-e',program,subject],{env,cwd:base,encoding:'utf8',timeout:8000});
        if(result.status!==0)throw new Error('isolated compile cache failed: '+result.stderr);
        const resultData=JSON.parse(result.stdout);resultData.cache=normalize(resultData.cache);return resultData;
      }
      if(call.module==='bundleWebScript'){
        const src=path.join(base,'project/apps/web/dist'),dest=path.join(root,'web-dist');
        fs.mkdirSync(src,{recursive:true});fs.mkdirSync(dest);fs.writeFileSync(path.join(dest,'old'),'old');
        if(call.variant==='present'){fs.writeFileSync(path.join(src,'index.html'),'fixture index');fs.mkdirSync(path.join(src,'assets'));fs.writeFileSync(path.join(src,'assets/nested'),'fixture asset');}
        const result=cp.spawnSync(node,[subject],{env,cwd:base,encoding:'utf8',timeout:8000});
        const read=(p:string)=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;
        return {code:result.status,stdout:result.stdout,stderr:result.stderr,index:read(path.join(dest,'index.html')),nested:read(path.join(dest,'assets/nested')),oldPreserved:fs.existsSync(path.join(dest,'old')),sourcePreserved:fs.existsSync(src)};
      }
      if(call.module==='bundleMessengerScript'){
        const log=path.join(base,'builder.json');const fake=path.join(bin,'bun');
        const program="#!"+node+"\nimport {writeFileSync} from 'node:fs';writeFileSync(process.env.JAIT_BUILD_FIXTURE_LOG,JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));console.log('fixture builder');if(process.env.JAIT_BUILD_FIXTURE_MODE==='exit')process.exit(7);if(process.env.JAIT_BUILD_FIXTURE_MODE==='signal')process.kill(process.pid,'SIGTERM');\n";
        fs.writeFileSync(fake,program,{mode:0o700});env.JAIT_BUILD_FIXTURE_LOG=log;env.JAIT_BUILD_FIXTURE_MODE=call.variant;
        if(call.variant!=='default')env.JAIT_BUILD_BUN=call.variant==='missing'?path.join(base,'absent-builder'):fake;
        const result=cp.spawnSync(node,[subject],{env,cwd:base,encoding:'utf8',timeout:8000});
        return {code:result.status,stdout:result.stdout,enoent:result.stderr.includes('ENOENT'),calls:fs.existsSync(log)?[JSON.parse(normalize(fs.readFileSync(log,'utf8')))]:[]};
      }
      if(call.module==='installRuntimeScript'){
        if(call.variant==='development')fs.mkdirSync(path.join(root,'src'));
        if(!['development','packaged'].includes(call.variant)){
          const runtime=path.join(root,'dist/services/code-graph/graphify-runtime.js');fs.mkdirSync(path.dirname(runtime),{recursive:true});
          fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
          fs.writeFileSync(runtime,"export async function ensureGraphifyRuntime(options){"+(call.variant==='error'?"throw new Error('fixture runtime failure');":call.variant==='primitive'?"throw 'primitive failure';":"options.onProgress('fixture progress');")+"}");
        }
        const result=cp.spawnSync(node,[subject],{env,cwd:base,encoding:'utf8',timeout:8000});
        return {code:result.status,stdout:result.stdout,stderr:result.stderr};
      }
      throw new Error('unknown packaging fixture');
    }finally{fs.rmSync(base,{recursive:true,force:true});}
  }
  if(call.op==='sourcereview.osResolver'){
    const {mock}=await import('bun:test');const constructors:unknown[]=[];let listCalls=0;
    const manager={async listRunningOsSandboxes(){listCalls++;if(call.fail)throw new Error('inventory failed');return call.infos;}};
    (globalThis as any).__jaitOsReview={constructors,manager};
    mock.module(new URL('packages/gateway/src/os-control/linux-desktop-driver.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      LinuxDesktopOsControlDriver:class {osType='linux-desktop';constructor(manager:unknown,name:string){const f=(globalThis as any).__jaitOsReview;f.constructors.push({type:'linux-desktop',args:[manager===f.manager?'manager':'wrong manager',name]});}}
    }));
    mock.module(new URL('packages/gateway/src/os-control/windows-driver.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      WindowsOsControlDriver:class {osType='windows';constructor(...args:unknown[]){(globalThis as any).__jaitOsReview.constructors.push({type:'windows',args});}}
    }));
    try{
      const subject=await import(specifier);const resolver=subject.createOsControlResolver(manager,call.ssh??{});
      if(call.action==='list')return {result:await resolver.listSandboxes(),listCalls,constructors};
      const binding=await resolver.resolve(call.name);return {result:{containerName:binding.containerName,type:binding.type,driverType:binding.driver.osType},listCalls,constructors};
    }catch(e){return {error:(e as Error).message,listCalls,constructors};}
    finally{delete (globalThis as any).__jaitOsReview;mock.restore();}
  }
  if(call.op==='sourcereview.surfaceTools'){
    const {mock}=await import('bun:test');const calls:unknown[]=[];
    (globalThis as any).__jaitSurfaceReview={call,calls};
    mock.module(new URL('packages/gateway/src/tools/browser-tools.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      createBrowserInspectTool(){return {async execute(input:unknown,context:any){const f=(globalThis as any).__jaitSurfaceReview;f.calls.push(['inspect',input,context.sessionId,context.projectRoot]);return f.call.inspectResult??{ok:true,message:'inspected',data:{browserId:'browser',extra:7}};}};}
    }));
    mock.module(new URL('packages/gateway/src/db/uuidv7.ts',new URL('../../../', import.meta.url)).pathname,()=>({uuidv7(){return 'fixed';}}));
    const registry={
      registeredTypes:['terminal','filesystem','browser'],
      listSnapshots(){calls.push(['list']);return call.snapshots;},
      async startSurface(type:string,id:string,options:unknown){calls.push(['start',type,id,options]);if(call.error){if(call.primitive)throw 'start failed';throw new Error('start failed');}return {snapshot(){return {id,type,...(options as object)};}};},
      async stopSurface(id:string,reason:unknown){calls.push(['stop',id,reason]);return call.stopped;},
      getSurface(id:unknown){calls.push(['get',id]);return call.browser?{id:'browser',snapshot(){return {id:'browser',type:'browser',state:'running'};}}:undefined;}
    };
    try{
      const subject=await import(specifier);const factory='createSurfaces'+call.action[0].toUpperCase()+call.action.slice(1)+'Tool';
      const tool=subject[factory](registry,call.preview?{}:undefined);
      return {result:await tool.execute(call.input??{},{sessionId:'current',projectRoot:'/fixture'}),calls};
    }finally{delete (globalThis as any).__jaitSurfaceReview;mock.restore();}
  }
  const m = await import(specifier);
  switch (call.op) {
    case 'sourcereview.barrel': {
      const { default: ts } = await import('typescript');
      const projectRoot = new URL('../../../', import.meta.url);
      const text = readFileSync(new URL(specifier, import.meta.url), 'utf8');
      const syntax = ts.createSourceFile(specifier, text, ts.ScriptTarget.Latest, true);
      const otherStatements = syntax.statements.filter(node => !ts.isExportDeclaration(node)).length;
      const bindings = [];
      for (const binding of call.bindings) {
        const original = await import(new URL(binding.path, projectRoot).href);
        bindings.push(m[binding.name] === (binding.original === '*' ? original : original[binding.original ?? binding.name]));
      }
      return { exports: Object.keys(m).sort(), bindings, otherStatements };
    }
    case 'sourcereview.voice': {
      const spoken: unknown[] = [];
      const tool = m.createVoiceSpeakTool({ speak(input: unknown) { spoken.push(input); if (call.fail) throw new Error('TTS fixture unavailable'); return { mimeType: 'audio/wav', audioBase64: 'YWJjZA==' }; } });
      if (call.metadata) { const { execute: _execute, ...metadata } = tool; return metadata; }
      try { return { result: await tool.execute(call.input, call.context ?? { sessionId: 'session-a' }), spoken }; }
      catch (error) { return { error: (error as Error).message, spoken }; }
    }
    case 'sourcereview.editor': {
      const sent: unknown[] = [];
      const ws = call.noChannel ? undefined : { sendUICommand(...args: unknown[]) { sent.push(args); if (call.fail) throw new Error('UI fixture unavailable'); } };
      const tool = m.createProjectEditorOpenTool(ws);
      if (call.metadata) { const { execute: _execute, ...metadata } = tool; return metadata; }
      try { return { result: await tool.execute({}, call.context), sent }; }
      catch (error) { return { error: (error as Error).message, sent }; }
    }
    case 'sourcereview.lists': {
      if (call.kind === 'ellipsize') return m.ellipsizeText(call.text, call.max);
      if (call.kind === 'list') return m.formatEllipsedList(call.lines, call.max);
      if (call.kind === 'summary') return m.summarizeWithPreview(call.summary, call.lines, call.max);
      if (call.kind === 'memory') return m.memoryLine(call.id, call.text, call.type, call.extra);
      return { characters: m.PREVIEW_MAX_CHARS, items: m.PREVIEW_MAX_ITEMS };
    }
    case 'sourcereview.swarm': {
      const now = Date.now; Date.now = () => 1234;
      try { return call.steps.map((step: any) => {
        switch (step.op) {
          case 'create': m.createSwarmRound(step.id, step.count); return null;
          case 'end': m.endSwarmRound(step.id); return null;
          case 'post': return structuredClone(m.postSwarmMessage(step.id, step.from, step.text));
          case 'count': return m.getSwarmParticipantCount(step.id);
          default: return structuredClone(m.peekSwarmMessages(step.id));
        }
      }); } finally { Date.now = now; }
    }
    case 'sourcereview.control': {
      const created: unknown[] = [];
      const sessions = call.noSessions ? undefined : {
        getById(id: string, user: string) { return call.sessions?.some((s: any) => s.id === id && s.userId === user) ? { id } : undefined; },
        create: call.noCreate ? undefined : (input: unknown) => { created.push(input); return { id: 'created-session' }; },
      };
      const surfaces = call.noSurfaces ? undefined : {
        getSurface(id: string) { return call.surfaces?.find((s: any) => s.id === id); },
        getOwner(id: string) { return call.surfaces?.find((s: any) => s.id === id)?.owner; },
      };
      const consent = call.noConsent ? undefined : { getRequest(id: string) { return call.requests?.find((r: any) => r.id === id); } };
      const threads = call.noThreads ? undefined : { getById(id: string) { return call.threads?.find((t: any) => t.id === id); } };
      const policy = new m.ControlAccess(sessions, surfaces, consent, threads);
      return { values: call.steps.map((step: any) => policy[step.kind](...step.args)), created };
    }
    case 'sourcereview.routes': {
      const { default: Fastify } = await import('../../../packages/gateway/node_modules/fastify/fastify.js');
      const app = Fastify({ logger: false });
      const events: unknown[] = [];
      if (call.module === 'trust') m.registerTrustRoutes(app, {
        listAll() { events.push(['list']); return [{ actionType: 'terminal', level: 2 }]; },
        getState(action: string) { events.push(['get', action]); if (call.fail) throw new Error('Trust fixture unavailable'); return { actionType: action, level: 1 }; },
        reset(action: string) { events.push(['reset', action]); return { actionType: action, level: 0 }; },
      });
      else m.registerHookRoutes(app, { hookSecret: 'fixture-secret', hooks: { emit(...args: unknown[]) { events.push(args); } },
        async onWake() { events.push(['onWake']); if (call.fail) throw new Error('Hook fixture unavailable'); return { awakened: true }; },
        async onAgentHook(payload: unknown) { events.push(['onAgentHook', payload]); if (call.fail) throw new Error('Hook fixture unavailable'); return { accepted: true }; },
      });
      try {
        const responses = [];
        for (const request of call.requests) { const response = await app.inject(request); responses.push({ status: response.statusCode, body: response.json() }); }
        return { responses, events };
      } finally { await app.close(); }
    }
    case 'sourcereview.surface': {
      let snapshots = 0;
      const surface = { type: call.type, snapshot() { snapshots++; return { metadata: call.metadata }; } };
      return { result: m.shouldSyncProjectSurfaceUi(surface), snapshots };
    }
    case 'sourcereview.ownership': {
      const sent: unknown[] = [];
      const reply = { status(code: number) { sent.push(code); return this; }, send(value: unknown) { sent.push(value); return this; } };
      return { result: m.assertOwnership(reply, call.resource, call.user, 'Resource unavailable'), sent };
    }
    case 'sourcereview.lease': {
      const releases: Record<string, () => void> = {};
      return call.steps.map((step: any) => {
        try { if (step.release) { releases[step.release]!(); return 'released'; }
          releases[step.key] = m.claimAssessmentExecution(step.id); return 'claimed'; }
        catch (error) { return { error: (error as Error).message }; }
      });
    }
    case 'sourcereview.state': {
      const previous = process.env.JAIT_STATE_DIR;
      try {
        if (call.value === null) delete process.env.JAIT_STATE_DIR; else process.env.JAIT_STATE_DIR = call.value;
        const value = m.getStateDirectory();
        return { value: value === join(homedir(), '.jait') ? '$DEFAULT' : value };
      } catch (error) { return { error: (error as Error).message }; }
      finally { if (previous === undefined) delete process.env.JAIT_STATE_DIR; else process.env.JAIT_STATE_DIR = previous; }
    }
    case 'sourcereview.inline': {
      if (call.html !== undefined) return m.embedInlineImages(call.html, new Map(call.images));
      const data = call.repeat ? call.repeat.character.repeat(call.repeat.count) : call.data;
      const value = m.inlineImageData(call.type, data);
      return call.summary && value !== null ? { prefix: value.slice(0, value.indexOf(',') + 1), length: value.length, bytes: Buffer.from(value.split(',')[1], 'base64').length } : value;
    }
    case 'sourcereview.preview': {
      if (call.token) return m.verifyPreviewToken(call.token, call.resource, call.secret);
      if (call.roundtrip) {
        const token = await m.signPreviewToken(call.user, call.resource, call.secret);
        const payload = jose.decodeJwt(token);
        return { user: await m.verifyPreviewToken(token, call.verifyResource ?? call.resource, call.verifySecret ?? call.secret),
          payload: { sub: payload.sub, purpose: payload.purpose, resource: payload.resource, ttl: Number(payload.exp) - Number(payload.iat) },
          algorithm: jose.decodeProtectedHeader(token).alg };
      }
      const token = await new jose.SignJWT(call.claims).setProtectedHeader({ alg: call.alg ?? 'HS256' }).sign(new TextEncoder().encode(call.secret));
      return m.verifyPreviewToken(token, call.resource, call.verifySecret ?? call.secret);
    }
    case 'sourcereview.origin': return m.isAllowedRequestOrigin(call.headers, { corsOrigin: call.cors ?? '' });
    case 'sourcereview.git': return m.resolveRemoteGitNodeId(call.nodes, call.cwd, call.requested, call.local);
    case 'sourcereview.shell': return call.line === undefined ? m.isPowerShellShell(call.shell) : m.isShellPromptLine(call.line, call.shell);
    case 'sourcereview.cron': return m.isValidCronExpression(call.repeat ? 'x'.repeat(call.repeat) : call.cron);
    case 'sourcereview.headers': {
      const input = { openaiApiKey: 'fixture-key', ...call.input };
      const first = m.llmRequestHeaders(input, call.session);
      if (!call.observeGenerated) return first;
      const second = m.llmRequestHeaders(input);
      const other = m.llmRequestHeaders({ ...input });
      return { keys: Object.keys(first).sort(), stable: first['x-opencode-session'] === second['x-opencode-session'],
        distinct: first['x-opencode-session'] !== other['x-opencode-session'],
        uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(first['x-opencode-session']) };
    }
    case 'sourcereview.devices': {
      const registry = new m.DeviceRegistry();
      const OriginalDate = Date;
      let tick = 0;
      const start = OriginalDate.parse('2026-01-01T00:00:00.000Z');
      globalThis.Date = class extends OriginalDate { constructor() { super(start + tick++ * 1000); } } as typeof Date;
      try {
        return call.steps.map((step: any) => step.op === 'register' ? registry.register(step.input) : step.op === 'heartbeat' ? registry.heartbeat(step.id) : step.op === 'count' ? registry.count() : registry.list());
      } finally { globalThis.Date = OriginalDate; }
    }

    case 'sourcereview.output': {
      const number = (x: unknown) => x === 'nan' ? NaN : x === 'infinity' ? Infinity : x;
      return m.getTerminalOutputSlice(call.buffer, call.count, number(call.offset), number(call.end), call.lines, call.trim);
    }
    case 'sourcereview.diagram': return m.createDiagramTool().execute(call.diagramRepeat ? {diagram:'x'.repeat(call.diagramRepeat)} : call.input);
    case 'sourcereview.link': return m.jaitLinkTool.execute(call.input);
    case 'sourcereview.mobile': {
      const calls: unknown[] = []; const now = Date.now; Date.now = () => 1767225600000;
      try { const result = await m.createMobileAlarmScheduleTool({scheduleAlarm(...args: unknown[]) { calls.push(args); return call.delivered ?? 0; }}).execute(call.input, call.context); return {result,calls}; }
      finally { Date.now = now; }
    }
    case 'sourcereview.mount': {
      const fs = await import('node:fs'); const path = await import('node:path');
      const base = fs.mkdtempSync(path.join(new URL('../../../', import.meta.url).pathname, '.jait/artifacts/source-review', 'worktree-'));
      try {
        const common=path.join(base, call.variant==='colon' ? 'bad:name' : 'repo', '.git');
        const admin=path.join(common, call.variant==='admin' ? 'unregistered' : 'worktrees', 'w'); const project=path.join(base,'project');
        fs.mkdirSync(admin,{recursive:true});fs.mkdirSync(project);
        if(call.variant==='missing') return m.worktreeGitMountArgs(project);
        if(call.variant==='directory'){fs.mkdirSync(path.join(project,'.git'));return m.worktreeGitMountArgs(project);}
        fs.writeFileSync(path.join(admin,'commondir'),'../..'); fs.writeFileSync(path.join(admin,'gitdir'),path.join(project,call.variant==='backlink' ? 'other' : '.git'));
        fs.writeFileSync(path.join(project,'other'),'dummy');
        if(call.variant==='symlink')fs.symlinkSync(path.join(project,'other'),path.join(project,'.git'));
        else fs.writeFileSync(path.join(project,'.git'),call.variant==='invalid' ? 'wrong marker' : 'gitdir: '+path.relative(project,admin)+'\n');
        try {return m.worktreeGitMountArgs(project).join(',').replaceAll(common,'COMMON');} catch(e){return (e as Error).message;}
      } finally {fs.rmSync(base,{recursive:true,force:true});}
    }
    case 'sourcereview.ownerRuntime': {
      const own=m.commandSandboxOwner();const [pid,start,boot]=own.split(':'); const previous=process.env.JAIT_STATE_DIR;
      try {
        process.env.JAIT_STATE_DIR='/fixture/state'; const a=m.commandSandboxGateway();process.env.JAIT_STATE_DIR=' /fixture/state ';const b=m.commandSandboxGateway();process.env.JAIT_STATE_DIR='/fixture/other';const c=m.commandSandboxGateway();
        return {ownAlive:m.commandSandboxOwnerAlive(own),wrongStart:m.commandSandboxOwnerAlive(`${pid}:${Number(start)+1}:${boot}`),wrongBoot:m.commandSandboxOwnerAlive(`${pid}:${start}:wrong-boot`),dead:m.commandSandboxOwnerAlive(`2147483647::${boot}`),malformed:['bad','-1::','0::','9007199254740992::','1:too:many:fields'].map(x=>m.commandSandboxOwnerAlive(x)),format:/^\d+:\d+:[0-9a-f-]+$/.test(own),digestLength:a.length,sameState:a===b,differentState:a!==c};
      }finally{if(previous===undefined)delete process.env.JAIT_STATE_DIR;else process.env.JAIT_STATE_DIR=previous;}
    }
    case 'sourcereview.usageCache': {
      let now=0,loads=0;const cache=new m.UsageRefreshCache(()=>now);
      if(call.mode==='force') {
        let finish!: (v:string)=>void;const first=cache.run('a',()=>{loads++;return new Promise<string>(r=>{finish=r;});});
        const joined=cache.run('a',async()=>{loads++;return 'wrong';},{force:true});await Promise.resolve();finish('first');const one=await first;
        now=299999;const fresh=cache.run('a',async()=>{loads++;return 'wrong';});const two=await fresh;
        const three=await cache.run('a',async()=>{loads++;return 'second';},{force:true});now+=300000;
        const four=await cache.run('a',async()=>{loads++;return 'third';});return {sameInFlight:first===joined,sameFresh:first===fresh,values:[one,two,three,four],loads};
      }
      if(call.mode==='backoff') {
        const load=async()=>{loads++;return loads<5?'bad':'ok';};const options={failed:(v:string)=>v==='bad'};
        const values=[];
        for(const instant of [0,599999,600000,1799999,1800000,3599999,3600000,5400000,5700000]){now=instant;values.push(await cache.run('a',load,options));}
        let throwLoads=0;const thrown=[];
        for(const key of ['sync','async']){try{await cache.run(key,()=>{throwLoads++;if(key==='sync')throw new Error(key);return Promise.reject(new Error(key));});}catch(e){thrown.push((e as Error).message);}}
        return {values,loads,thrown,throwLoads};
      }
      const promises=[];for(let i=0;i<1000;i++)promises.push(cache.run(String(i),async()=>{loads++;return 'old';}));
      const joined=promises[0]===cache.run('0',async()=>{loads++;return 'wrong';},{force:true});let blocked='';try{await cache.run('new',async()=>{loads++;return 'wrong';});}catch(e){blocked=(e as Error).message;}
      await Promise.all(promises);now=300000;const expired=await cache.run('new',async()=>{loads++;return 'new';});return {blocked,joined,expired,loads};
    }


    case 'sourcereview.mcpConfig': return m.mergeJaitCodexConfig(call.input);
    case 'sourcereview.mcpConstants': return [m.JAIT_CORE_MCP_SERVER_NAME,m.JAIT_DEFERRED_MCP_SERVER_NAME,m.JAIT_CORE_CODE_MODE_NAMESPACE,m.OMNIROUTE_MCP_SERVER_NAME];
    case 'sourcereview.messenger': {
      const signal=new AbortController().signal;const calls: unknown[]=[];
      const tools=m.createMessengerTools({request(user:unknown,command:unknown,received:unknown){calls.push({user,command,sameSignal:signal===received});return {ok:true,message:'fixture bridge result'};}});
      if(call.metadata)return tools.map((t:any)=>({name:t.name,risk:t.risk,consent:t.defaultConsentLevel,required:t.parameters.required}));
      const tool=tools.find((t:any)=>t.name==='messenger.'+call.action);
      return {result:await tool.execute(call.input,{userId:'fixture-user',signal}),calls};
    }

    case 'sourcereview.nodeState': {
      const OriginalDate=Date;let instant=0;
      globalThis.Date=class extends OriginalDate {constructor(){super(instant);}static now(){return instant;}} as DateConstructor;
      try {
        const manager=new m.NodeStateManager();const results=[];
        for(const [index,action] of call.actions.entries()) {
          instant=index*1000;
          switch(action.kind) {
            case 'upsert': results.push(manager.upsertNode(action.input));break;
            case 'get': results.push(manager.getNode(action.id));break;
            case 'client':results.push(manager.getClientId(action.id));break;
            case 'remove':results.push(manager.removeNode(action.id));break;
            case 'disconnect':results.push(manager.removeNodesByClientId(action.clientId));break;
            case 'list':results.push(manager.listNodes());break;
            case 'snapshot':results.push(manager.getSnapshot());break;
            default:throw new Error('unknown node fixture action');
          }
        }
        return results;
      }finally{globalThis.Date=OriginalDate;}
    }
    case 'sourcereview.transfer': {
      const fs=await import('node:fs');const path=await import('node:path');
      const base=fs.mkdtempSync(path.join(new URL('../../../', import.meta.url).pathname,'.jait/artifacts/source-review','transfer-'));
      const before={path:process.env.PATH,log:process.env.JAIT_TRANSFER_FIXTURE_LOG,fail:process.env.JAIT_TRANSFER_FIXTURE_FAIL};
      try {
        const log=path.join(base,'calls.jsonl');process.env.JAIT_TRANSFER_FIXTURE_LOG=log;process.env.JAIT_TRANSFER_FIXTURE_FAIL=call.fail??'';
        for(const program of ['ssh','scp']) fs.writeFileSync(path.join(base,program),`#!${process.execPath}\nimport {appendFileSync} from 'node:fs';\nconst name=${JSON.stringify(program)};\nappendFileSync(process.env.JAIT_TRANSFER_FIXTURE_LOG,JSON.stringify({file:name,args:process.argv.slice(2)})+'\\n');\nif(process.env.JAIT_TRANSFER_FIXTURE_FAIL===name){console.error('fixture failure');process.exit(7);}\nconsole.log(name+' out');console.error(name+' err');\n`,{mode:0o700});
        process.env.PATH=base;
        let result;try{result=await m.transferProjectWithScp(call.input);}catch(error){const e=error as any;result={error:e.code===7?'fixture process exit 7':e.message};}
        return {result,calls:fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line)):[]};
      } finally {
        if(before.path===undefined)delete process.env.PATH;else process.env.PATH=before.path;
        if(before.log===undefined)delete process.env.JAIT_TRANSFER_FIXTURE_LOG;else process.env.JAIT_TRANSFER_FIXTURE_LOG=before.log;
        if(before.fail===undefined)delete process.env.JAIT_TRANSFER_FIXTURE_FAIL;else process.env.JAIT_TRANSFER_FIXTURE_FAIL=before.fail;
        fs.rmSync(base,{recursive:true,force:true});
      }
    }
    case 'sourcereview.notificationNormalize':return m.normalizeNotificationDetail(call.raw);

    case 'sourcereview.networkRow':return m.containerResource(call.row,'observed');
    case 'sourcereview.networkCache': {
      const original=Date.now;let now=0,runs=0,failed=false;
      const inventory=new m.DockerResourceInventory(async()=>{runs++;if(failed)throw new Error('docker failed');return '';});
      try{
        Date.now=()=>now;
        const first=inventory.get(),joined=inventory.get();const a=await first,b=await joined;
        now=29999;const cached=await inventory.get();now=30000;const expired=await inventory.get();
        failed=true;now=60000;const failure=await inventory.get();failed=false;now=89999;const failureCached=await inventory.get();now=90000;const restored=await inventory.get();
        return {sameCachedObject:a===cached,sameJoinedObject:a===b,runs,statuses:[a,b,cached,expired,failure,failureCached,restored].map(x=>x.status)};
      }finally{Date.now=original;}
    }
    case 'sourcereview.networkCap': {
      const calls:string[][]=[];const ids=Array.from({length:514},(_,i)=>(i+1).toString(16).padStart(64,'0'));
      const inventory=new m.DockerResourceInventory(async(args:string[])=>{calls.push(args);return args[0]==='ps'?'invalid\n'+ids.join('\n')+'\n':'';});
      const result=await inventory.get();
      return {...result,calls:calls.length,batchSizes:calls.slice(1).map(x=>x.length-5),firstId:calls[1]?.[5],lastId:calls.at(-1)?.at(-1),inspectPrefix:calls[1]?.slice(0,3),ps:calls[0]};
    }
    case 'sourcereview.networkInvalid': {
      let calls=0;const inventory=new m.DockerResourceInventory(async()=>{calls++;return calls===1?'a'.repeat(64):'invalid json';});
      const first=await inventory.get(),second=await inventory.get();return {first,second,calls,sameCachedObject:first===second};
    }
    case 'sourcereview.maintenance': {
      const calls:unknown[]=[],notifications:unknown[]=[];
      const run=async(method:string,args:unknown[])=>{calls.push({method,args});if(call.error){if(call.primitive)throw call.error;throw new Error(call.error);}return call.results;};
      const service={runForRepo:(...args:unknown[])=>run('repo',args),runAll:(...args:unknown[])=>run('all',args)};
      const notify=(kind:string,args:unknown[])=>{notifications.push({kind,args});if(call.notificationError)throw new Error('notify failed');};
      const tool=m.createMaintenanceRunTool(service,call.disableNotifications?undefined:{success:(...a:unknown[])=>notify('success',a),warning:(...a:unknown[])=>notify('warning',a)});
      const original=Date.now;try{Date.now=()=>123;return {result:await tool.execute(call.input,call.manual?{}:{actionId:'action'}),calls,notifications};}finally{Date.now=original;}
    }

    case 'sourcereview.ollamaSetup': {
      const fs=await import('node:fs');const path=await import('node:path');const os=await import('node:os');
      const base=fs.mkdtempSync(path.join(new URL('../../../', import.meta.url).pathname,'.jait/artifacts/source-review','ollama-'));
      const previous=process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;const blocked=path.join(base,'blocked');
      try {
        const key=path.join(base,call.mode==='unreadable'?"a'b":call.mode==='blocked'?'blocked/key':'key');
        if(call.mode==='directory')fs.mkdirSync(key);
        else if(call.mode!=='missing'){
          if(call.mode==='blocked')fs.mkdirSync(blocked);
          fs.writeFileSync(key,'fixture content never read');
          if(call.mode==='unreadable')fs.chmodSync(key,0);
          if(call.mode==='blocked')fs.chmodSync(blocked,0);
        }
        process.env.JAIT_OLLAMA_DEVICE_KEY_PATH=' '+key+' ';
        const result=await m.getOllamaUsageSetup(call.url??'http://localhost:11434');
        const user=os.userInfo();
        return {hostMatches:result.host===os.hostname(),userMatches:result.gatewayUser===user.username,platform:result.platform,local:result.local,keyStatus:result.keyStatus,keyPath:result.keyPath?.replaceAll(base,'BASE')??null,permissionCommand:result.permissionCommand?.replaceAll(base,'BASE').replace('u:'+user.uid+':r','u:UID:r')??null};
      } finally {
        if(fs.existsSync(blocked))fs.chmodSync(blocked,0o700);
        if(previous===undefined)delete process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;else process.env.JAIT_OLLAMA_DEVICE_KEY_PATH=previous;
        fs.rmSync(base,{recursive:true,force:true});
      }
    }

    case 'sourcereview.pluginSdk': {
      let executeArgs:unknown[]=[];const execute=(...args:unknown[])=>{executeArgs=args;return {ok:true,message:'fixture'};};
      const input={...call.tool,execute};const tool=m.toPluginToolDefinition(call.plugin,input);
      const executeResult=await tool.execute({value:1},{sessionId:'fixture'});
      return {metadata:m.buildPluginToolSourceMetadata(call.plugin),tool,callbackIdentity:tool.execute===execute,newObject:tool!==input,originalSource:input.source,executeResult,executeArgs};
    }
    case 'sourcereview.pluginEntry': {
      const calls:unknown[]=[];const setup=async(context:unknown)=>{calls.push(['setup',context]);if(call.fail)throw new Error('setup failed');return {settingsSchema:{type:'object'}};};
      const dispose=async()=>{calls.push(['dispose']);if(call.fail)throw new Error('dispose failed');};
      const entry=m.definePlugin({id:'fixture.plugin',displayName:'Fixture',setup,...(call.custom?{dispose}:{})});
      const result:any={id:entry.id,displayName:entry.displayName,setupIdentity:entry.setup===setup,disposeIdentity:call.custom?entry.dispose===dispose:null,calls};
      try{result.setupResult=await entry.setup({projectRoot:'fixture'});}catch(e){result.setupError=(e as Error).message;}
      try{result.disposed=(await entry.dispose())??null;}catch(e){result.disposeError=(e as Error).message;}return result;
    }
    case 'sourcereview.cronTool': {
      const calls:unknown[]=[];const record=(name:string,args:unknown[])=>{calls.push([name,...args]);if(call.fail)throw new Error('scheduler failed');};
      const scheduler={
        create(...args:unknown[]){record('create',args);return {id:'created'};},
        list(...args:unknown[]){record('list',args);return call.jobs??[];},
        remove(...args:unknown[]){record('remove',args);return call.removed??false;},
        update(...args:unknown[]){record('update',args);return call.updated??null;}
      };
      const method='createCron'+call.action[0].toUpperCase()+call.action.slice(1)+'Tool';
      try{return {result:await m[method](scheduler).execute(call.input,{userId:'user',projectRoot:'/fixture/project'}),calls};}
      catch(e){return {threw:(e as Error).message,calls};}
    }
    case 'sourcereview.sqlTool': {
      const calls:unknown[]=[];const service={schema(){calls.push(['schema']);return call.response;},query(input:unknown){calls.push(['query',input]);return call.response;}};
      return {result:await m.createSessionSqlTool(service).execute(call.input,{}),calls};
    }

    case 'sourcereview.smokeProcess':{
      const {EventEmitter,once}=await import('node:events');
      if(call.mode==='states')return [m.hasExited(null),m.hasExited({exitCode:null,signalCode:null}),m.hasExited({exitCode:0,signalCode:null}),m.hasExited({exitCode:null,signalCode:'SIGTERM'})];
      if(call.mode==='sync'){
        class Child extends EventEmitter {exitCode:number|null=null;signalCode=null;killCount=0;listenersAtKill=0;kill(){this.killCount++;this.listenersAtKill=this.listenerCount('exit');this.exitCode=0;this.emit('exit',0,null);}}
        const child=new Child();await m.terminateChild(child);await m.terminateChild(child);return {killCount:child.killCount,listenersAtKill:child.listenersAtKill,exitListeners:child.listenerCount('exit'),after:m.hasExited(child)};
      }
      const {spawn}=await import('node:child_process');
      const child=spawn('/usr/bin/node',['-e',"process.stdout.write('ready');setInterval(()=>{},1000)"],{stdio:['ignore','pipe','pipe'],env:{LANG:'C.UTF-8'}});
      try{await once(child.stdout,'data');const before=m.hasExited(child);await m.terminateChild(child);await m.terminateChild(child);return {before,after:m.hasExited(child),exitCode:child.exitCode,signal:child.signalCode};}
      finally{if(!m.hasExited(child))child.kill('SIGKILL');}
    }

    case 'sourcereview.httpRoutes': {
      const {default:Fastify}=await import('../../../packages/gateway/node_modules/fastify/fastify.js');
      const auth=await import(new URL('packages/gateway/src/security/http-auth.ts',new URL('../../../', import.meta.url)).href);
      const token=await auth.signAuthToken({id:'user',username:'fixture'},'fixture-route-secret');
      const config={jwtSecret:'fixture-route-secret'};const app=Fastify({logger:false});const events:unknown[]=[];
      const initialState={halted:false,reason:null,haltedAt:null,updatedAt:12};
      let controlState:any=initialState;
      if(call.module==='agentControlRoutes'){
        m.registerAgentControlRoutes(app,config,{
          agentControl:{
            getState(user:unknown){events.push(['get',user]);return controlState;},
            async halt(user:unknown,options:any){events.push(['halt',user,options]);controlState={halted:true,reason:options.reason,haltedAt:'halt-time',updatedAt:12};return {state:controlState,stopped:2,stopError:call.partial?'fixture runner failed':null};},
            resume(user:unknown){events.push(['resume',user]);controlState=initialState;return controlState;}
          },
          audit:{write(record:unknown){events.push(['audit',record]);if(call.auditError)throw new Error('audit failed');}}
        });
      }else if(call.module==='pluginRoutes'){
        let current={keep:'old',overwrite:1,nested:{a:1}};
        const fail=()=>{if(call.fail){if(call.primitive)throw 'primitive failure';throw new Error('manager failed');}};
        m.registerPluginRoutes(app,config,{
          listInstalled(){events.push(['list']);return [{id:'p',status:'disabled'}];},
          getPlugin(id:unknown){events.push(['get',id]);return call.missing?null:{id,config:current};},
          async enable(id:unknown){events.push(['enable',id]);fail();return {id,enabled:true};},
          async disable(id:unknown){events.push(['disable',id]);fail();return {id,enabled:false};},
          async uninstall(id:unknown){events.push(['uninstall',id]);fail();},
          getPluginConfig(id:unknown){events.push(['getConfig',id]);fail();return current;},
          async setPluginConfig(id:unknown,value:any){events.push(['setConfig',id,value]);fail();current=value;},
          async syncAndLoad(){events.push(['scan']);}
        });
      }else if(call.module==='screenShareRoutes'){
        const session={id:'share',active:true};
        const record=(name:string,...args:unknown[])=>{events.push([name,...args]);if(call.fail===name){if(call.primitive)throw 'fixture failed';throw new Error('fixture failed');}};
        m.registerScreenShareRoutes(app,{
          screenShare:{
            getState(){record('state');return {devices:[{id:'d'}],id:null};},
            registerDevice(input:unknown){record('register',input);return input;},
            startShare(input:unknown){record('start',input);return session;},
            transferControl(id:unknown){record('control',id);return session;},
            stopShare(){record('stop');return call.emptyStop?null:session;},
            captureScreen(){record('capture');return {data:'fixture'};},
            startRecording(){record('record');return {id:'record'};}
          },
          ws:{broadcastScreenShareState(value:unknown){record('broadcast',value);},sendScreenShareStartRequest(...args:unknown[]){record('requestStart',...args);}}
        });
      }else if(call.module==='maintenanceRoutes'){
        const result={id:'run',repoName:'Repo',allPassed:!call.failed,planId:call.failed?'plan':null,checks:[{name:'types',passed:!call.failed,durationMs:12}]};
        m.registerMaintenanceRoutes(app,config,{
          maintenanceService:{
            listRuns(jobId:unknown,limit:unknown){events.push(['list',jobId,limit]);return [];},
            getRun(id:unknown){events.push(['get',id]);return call.missing?null:result;},
            async runForRepo(id:unknown,jobId:string){events.push(['run',id,/^manual-\d+$/.test(jobId)]);if(call.error)throw new Error('maintenance failed');return result;}
          },
          notifications:{success(...args:unknown[]){events.push(['success',...args]);},warning(...args:unknown[]){events.push(['warning',...args]);}},
          ws:{broadcastAll(event:any){events.push(['broadcast',{...event,timestamp:/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(event.timestamp)?'<time>':event.timestamp}]);}}
        });
      }else throw new Error('unregistered HTTP fixture');
      try{
        const responses=[];
        for(const original of call.requests){
          const {auth:authenticated,...request}=original;
          request.headers={...request.headers,...(authenticated===false?{}:{authorization:'Bearer '+token})};
          const response=await app.inject(request);responses.push({status:response.statusCode,body:response.json()});
        }
        return {responses,events};
      }finally{await app.close();}
    }

    case 'sourcereview.messengerBridge': {
      const bridge=new m.MessengerBridge(),controller=new AbortController();const sent:unknown[]=[],gatewayCalls:unknown[]=[],requestIds:string[]=[];
      const now=Date.now;Date.now=()=>100;
      const capture=(client:string,request:any)=>{
        requestIds.push(request.requestId);sent.push({client,request:{...request,requestId:/^[0-9a-f-]{36}$/.test(request.requestId)?'<uuid>':request.requestId}});
        if(call.mode==='busy')return;
        if(call.mode==='timeout')return;
        if(call.mode==='throw')throw new Error('send failed');
        if(call.mode==='disconnect'){bridge.unregister(client);return;}
        if(call.mode==='replace'){bridge.register(client,{userId:'user',active:()=>true,send:()=>{}});return;}
        if(call.mode==='cancel'){controller.abort();return;}
        if(call.mode==='mismatch'){
          bridge.complete('other','user',request.requestId,{ok:true,message:'wrong client'});
          bridge.complete(client,'other',request.requestId,{ok:true,message:'wrong owner'});
          bridge.complete(client,'user','wrong request',{ok:true,message:'wrong request'});
          bridge.complete(client,'user',request.requestId,{ok:'yes',message:'wrong shape'});
        }
        const response=call.mode==='oversized'?{ok:true,message:'large',data:'x'.repeat(150001)}:{ok:true,message:call.mode==='longMessage'?'x'.repeat(2001):'browser result',data:{fixture:true},discard:'extra'};
        bridge.complete(client,client==='foreign'?'other':'user',request.requestId,response);
      };
      try{
        if(call.mode==='gateway')bridge.setGatewayHandler(async(user:unknown,command:unknown,signal:unknown)=>{gatewayCalls.push({user,command,sameSignal:signal===controller.signal});return {ok:true,message:'gateway'};});
        if(call.mode!=='validation'){
          bridge.register('foreign',{userId:'other',active:()=>true,send:(request:any)=>capture('foreign',request)});
          bridge.register('owner',{userId:'user',active:()=>call.mode!=='none',send:(request:any)=>capture('owner',request)});
          if(['multiple','gateway'].includes(call.mode))bridge.register('second',{userId:'user',active:()=>true,send:(request:any)=>capture('second',request)});
        }
        if(call.aborted)controller.abort();
        let value;
        if(call.mode==='busy'){const pending=[];for(let i=0;i<33;i++)pending.push(bridge.request('user',{action:'status'},controller.signal,1000));bridge.stop();value=await Promise.all(pending);}
        else value=await bridge.request(call.missingUser?undefined:'user',call.input??{action:'status'},controller.signal,call.mode==='timeout'?0:1000);
        return {result:value,sent,gatewayCalls,uniqueRequests:new Set(requestIds).size};
      }finally{bridge.stop();Date.now=now;}
    }

    case 'sourcereview.subscriptionFetchers': {
      const original=globalThis.fetch;const calls:unknown[]=[];let cancelled=0,reads=0;
      let html=call.html??'';
      if(call.padTo)html=html.padEnd(call.padTo,' ');
      if(call.multibyte)html='😀'.repeat(call.multibyte)+html;
      const bytes=new TextEncoder().encode(html);let position=0;
      globalThis.fetch=Object.assign(async(input:unknown,options:any={})=>{
        calls.push({url:String(input),headers:options.headers,redirect:options.redirect,signalPresent:Boolean(options.signal&&typeof options.signal.aborted==='boolean'),signalAborted:options.signal.aborted});
        const body=call.response===undefined?null:structuredClone(call.response);
        if(call.nonfinite&&body)body.usage.rolling.percent=NaN;
        const status=call.status??200;
        return {status,ok:status>=200&&status<300,async json(){return body;},body:call.empty?null:{getReader(){return {
          async read(){reads++;if(call.readError&&position>0)throw new Error('fixture stream failed');if(position++===0)return {value:bytes,done:false};return {done:true};},
          async cancel(){cancelled++;}
        };}}} as any;
      },{preconnect:original.preconnect});
      try{
        let output;
        if(call.mode==='cookie'){const raw=call.length?'x'.repeat(call.length):call.input;const normalized=m.normalizeOllamaSession(raw);output=call.length?normalized.length:normalized;}
        else if(call.mode==='parse')output=m.parseOllamaSettingsUsage(html);
        else if(call.mode==='go')output=await m.fetchOpenCodeGoUsage('fixture-go-key');
        else output=await m.fetchOllamaSettingsUsage(' __Secure-session=fixture-cookie ');
        return {value:output,calls,cancelled,reads};
      }catch(e){return {error:(e as Error).message,calls,cancelled,reads};}
      finally{globalThis.fetch=original;}
    }

    case 'sourcereview.skills':
      return call.kind === 'constant' ? m.SKILL_DISCOVERY_INSTRUCTIONS : m.formatSkillsForPrompt(call.skills ?? []);

    case 'sourcereview.modelResult': {
      if (call.kind === 'project') return m.projectModelData(call.data);
      if (call.kind === 'bound') {
        const value = m.boundModelData(call.data, call.max);
        const o = value ?? {};
        return {
          truncated: o.truncated === true, originalChars: o.originalChars ?? null,
          previewChars: typeof o.preview === 'string' ? o.preview.length : null,
          preview: typeof o.preview === 'string' ? o.preview : null,
          ok: o.ok ?? null, exitCode: o.exitCode ?? null, timedOut: o.timedOut ?? null,
          needsInteraction: o.needsInteraction ?? null, terminalId: o.terminalId ?? null,
          outputOffset: o.outputOffset ?? null, outputEndOffset: o.outputEndOffset ?? null,
          jsonLength: JSON.stringify(value).length,
        };
      }
      return m.serializeToolResultForModel(call.result);
    }

    case 'sourcereview.usage': {
      const u1 = { inputTokens: 100, outputTokens: 10, cachedInputTokens: 40 };
      const u2 = { inputTokens: 150, outputTokens: 20, cachedInputTokens: 60, requestCount: 2 };
      const total1 = m.parseCodexUsage({ msg: { tokenUsage: {
        total: { inputTokens: 188328, outputTokens: 797, cachedInputTokens: 157184, requestCount: 6 },
        last: { inputTokens: 26210, outputTokens: 62, cachedInputTokens: 7168, requestCount: 1 } } } });
      const total2 = { inputTokens: 200000, outputTokens: 859, cachedInputTokens: 165184, requestCount: 7, scope: 'session' };
      const probe = (u: any) => u ? {
        inputTokens: u.promptTokens, outputTokens: u.completionTokens, totalTokens: u.totalTokens,
        cachedPromptTokens: u.cachedPromptTokens ?? -1, requestCount: u.requestCount ?? -1,
      } : { inputTokens: -1, outputTokens: -1, totalTokens: -1, cachedPromptTokens: -1, requestCount: -1 };
      if (call.kind === 'parse') return {
        codex: m.parseCodexUsage(call.params) ?? null,
        flat: m.parseCodexUsage({ tokenUsage: { total_token_usage: { input_tokens: 800, output_tokens: 40, cachedReadTokens: 800 } } }) ?? null,
        acp: m.parseAcpUsage(call.acp, 'turn-1') ?? null,
      };
      if (call.kind === 'rejects') return {
        cachedOverInput: m.parseCodexUsage({ tokenUsage: { total: { inputTokens: 10, outputTokens: 1, cachedInputTokens: 11 } } }) === undefined,
        missingOutput: m.parseCodexUsage({ tokenUsage: { total: { inputTokens: 10 } } }) === undefined,
        overSafe: m.parseAcpUsage({ inputTokens: 9007199254740992, outputTokens: 1 }, 'turn-1') === undefined,
      };
      if (call.kind === 'scenarios') {
        const a = new m.TurnUsageAccumulator(total1, false); a.add(total2);
        const charged = probe(a.metrics(9000));
        a.add(total1); a.add(total2);
        const afterRepeat = probe(a.metrics(9000));
        const b = new m.TurnUsageAccumulator(undefined, false); b.add(total1);
        const resumed = probe(b.metrics(9000));
        const c = new m.TurnUsageAccumulator(total1, true);
        const freshFirst = probe(c.metrics(9000)); c.add(total2);
        const freshAfter = probe(c.metrics(9000));
        const t = new m.TurnUsageAccumulator(undefined, false);
        t.add(m.parseAcpUsage(u1, 'turn-1')); t.add(m.parseAcpUsage(u2, 'turn-1'));
        t.add(m.parseAcpUsage({ inputTokens: 200, outputTokens: 20 }, 'turn-2'));
        const turn = probe(t.metrics(5000));
        return { charged, afterRepeat, resumed, freshFirst, freshAfter, turn, baselineAfterTurns: t.baseline ?? null };
      }
      const l = new m.TurnUsageAccumulator(undefined, false); l.add(total1);
      const s = l.metrics(4321);
      return {
        tokenUsageEstimated: s?.tokenUsageEstimated ?? null,
        totalMatches: s ? s.totalTokens === s.promptTokens + s.completionTokens : null,
        requestCount: s?.requestCount ?? -1,
        cachedPromptTokens: s?.cachedPromptTokens ?? -1,
        durationMs: s?.durationMs ?? -1,
      };
    }

    default: throw new Error('unknown source review operation');
  }
}

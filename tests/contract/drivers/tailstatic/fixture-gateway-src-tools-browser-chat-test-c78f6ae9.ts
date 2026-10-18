// Translated fixture from packages/gateway/src/tools/browser-chat.test.ts; expected literals are in tail_static.rs.
import { createBrowserNavigateTool } from "../../../../packages/gateway/src/tools/browser-tools.js";
import { createSurfacesStartTool } from "../../../../packages/gateway/src/tools/surface-tools.js";
import { createPreviewOpenTool } from "../../../../packages/gateway/src/tools/preview-tools.js";
import { PreviewService } from "../../../../packages/gateway/src/services/preview.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/browser-chat.test.ts",import.meta.url).href;
const __jait_require=__jait_createRequire(__jait_original_url);
const __jait_original_dir=__jait_fileURLToPath(new URL('.',__jait_original_url));
const __jait_fixture_dir=__jait_fileURLToPath(new URL('../../../../.jait/artifacts/gateway-rust-readiness/tailstatic-fixtures/',import.meta.url));
const __jait_symbols=new Map<symbol,number>();
// Fixture transport only. Rust owns all comparison semantics.
function __jait_boxed(value: any): any {
 const type=typeof value;
 if(type==='symbol'){let id=__jait_symbols.get(value);if(!id){id=__jait_symbols.size+1;__jait_symbols.set(value,id)}return {type,value:id};}
 if(type==='function')return {type,name:value.name};
 if(type==='undefined')return {type};
 if(type==='bigint')return {type,value:String(value)};
 if(type==='number'&&!Number.isFinite(value))return {type:'nonfinite',value:String(value)};
 const prototype=type==='object'&&value!==null?(Object.getPrototypeOf(value)?.constructor?.name??null):null;
 if(value instanceof Error)value={...value,name:value.name,message:value.message,...('cause' in value?{cause:value.cause}:{})};
 return JSON.parse(JSON.stringify({type,value,prototype},function(this:any,_key:string,child:any){const original=Object.getOwnPropertyDescriptor(this,_key)?.value;if(original instanceof Date)return {__jait_type:'date',value:Number.isNaN(original.getTime())?'NaN':original.toISOString()};if(typeof child==='string'&&!child.isWellFormed())return {__jait_type:'utf16',units:Array.from({length:child.length},(_,i)=>child.charCodeAt(i))};if(typeof AbortSignal!=='undefined'&&child instanceof AbortSignal)return {__jait_type:'AbortSignal',aborted:child.aborted};if(child instanceof Map)return {__jait_type:'map',entries:[...child]};if(child instanceof Set)return {__jait_type:'set',values:[...child]};if(child instanceof RegExp)return {__jait_type:'regexp',source:child.source,flags:child.flags};if(ArrayBuffer.isView(child)&&!(child instanceof DataView))return {__jait_type:child.constructor.name,values:Array.from(child as any)};if(typeof child==='number'&&!Number.isFinite(child))return {__jait_type:'nonfinite',value:String(child)};return typeof child==='bigint'?{__jait_type:'bigint',value:String(child)}:typeof child==='undefined'?{__jait_type:'undefined'}:typeof child==='function'?{__jait_type:'function'}:child;}));
}

export async function run(name: string): Promise<unknown> {
 await __jait_mkdir(__jait_fixture_dir,{recursive:true});
 const __jait_observations: any[]=[];
 const __jait_record=(row:any)=>{__jait_observations.push(row);__jait_observe(row)};
 const __jait_refs=new WeakMap<object,number>(); let __jait_nextRef=1;
 const __jait_ref=(v:any)=>{if((typeof v!=='object'||v===null)&&typeof v!=='function')return null;let n=__jait_refs.get(v);if(!n){n=__jait_nextRef++;__jait_refs.set(v,n)}return n};
 const __jait_capture=(slot:number,actual:any,...other:any[])=>{const row:any={slot,actual:__jait_boxed(actual),ref:__jait_ref(actual)};if(Array.isArray(actual)||actual instanceof Set)row.itemRefs=Array.from(actual,__jait_ref);if(other.length){row.other=__jait_boxed(other[0]);row.otherRef=__jait_ref(other[0])}__jait_record(row)};
 const __jait_captureType=(slot:number,actual:any)=>__jait_record({slot,actual:(typeof actual==='object'&&actual!==null)?{type:'object',value:{}}:__jait_boxed(actual)});
 const __jait_captureResolved=async(slot:number,p:Promise<unknown>,...other:any[])=>__jait_capture(slot,await p,...other);
 const __jait_errorRow=(slot:number,e:any,expected?:any)=>{const errorTypes=[],prototypes=[];let p=e&&typeof e==='object'?Object.getPrototypeOf(e):null;while(p){if(p.constructor?.name)errorTypes.push(p.constructor.name);prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}const identity=typeof expected==='function';if(identity&&(expected[Symbol.hasInstance]!==Function.prototype[Symbol.hasInstance]||expected.prototype===null||typeof expected.prototype!=='object'))throw new Error('unsupported exception constructor identity');return {slot,threw:true,error:String(e instanceof Error?e.message:e),errorTypes,...(identity?{prototypes,expectedPrototype:__jait_ref(expected.prototype)}:{})}};
 const __jait_thrown=(slot:number,fn:()=>unknown,...other:any[])=>{let row:any;try{fn();row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_rejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{await p;row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_captureRejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{const actual=await p;row={slot,threw:false,actual:__jait_boxed(actual)}}catch(e){row={...__jait_errorRow(slot,e,other[0]),actual:__jait_boxed(e)}}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_instance=(slot:number,actual:any,expected:any,threw?:boolean)=>{const prototypes=[];let p=actual==null?null:Object.getPrototypeOf(actual);while(p){prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}__jait_record({slot,prototypes,expectedPrototype:__jait_ref(expected.prototype),...(threw===undefined?{}:{threw})})};
 const __jait_instanceRejected=async(slot:number,p:Promise<unknown>,expected:any)=>{let actual:any,threw=false;try{actual=await p}catch(e){actual=e;threw=true}__jait_instance(slot,actual,expected,threw)};
 switch(name){
case "tailstatic_packages_gateway_src_tools_browser_chat_test_ts_32_3": {


function fixture() {
  const surfaces = new Map<string, any>();
  const registry = {
    getSurface: (id: string) => surfaces.get(id),
    startSurface: vi.fn(async (_type: string, id: string, input: any) => {
      const browser = {
        id, type: 'browser', state: 'running', sessionId: input.sessionId,
        snapshot: () => ({ id, type: 'browser', state: 'running', sessionId: input.sessionId, metadata: {} }),
        navigate: vi.fn().mockResolvedValue({ url: 'https://example.com/', title: 'Example', text: 'Hello', elements: [], activeElement: null, dialogs: [], obstruction: null }),
        inspect: async () => ({ snapshot: { url: 'about:blank', title: '', text: '', elements: [], activeElement: null, dialogs: [], obstruction: null } }),
        getEvents: () => [], getMetrics: async () => null,
        getLiveViewInfo: () => ({ novncUrl: 'ws://localhost:6080', vncPort: 5900, websockifyPort: 6080 }),
      };
      surfaces.set(id, browser);
      return browser;
    }),
    stopSurface: vi.fn(async (id: string) => { surfaces.delete(id); }),
  };
  const service = new PreviewService(registry as any);
  const tool = createBrowserNavigateTool(registry as any, service);
  const context = (sessionId: string) => ({ sessionId, actionId: 'test', requestedBy: 'assistant', projectRoot: '/project' });
  return { registry, service, tool, context };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, context } = fixture();
    const open = createPreviewOpenTool(undefined, undefined, service);
    const result = await open.execute({ target: '4173' }, context('agent-preview'));
    __jait_capture(0, (result.ok));
    __jait_capture(1, (service.get('agent-preview')?.sharedWithAgent));
    __jait_thrown(2, () => service.assertAgentControl(result.data!.browserId as string));
    service.setSharedWithAgent('agent-preview', false);
    await open.execute({ target: '4173' }, context('agent-preview'));
    __jait_capture(3, (service.get('agent-preview')?.sharedWithAgent));
    await open.execute({ target: '4174' }, context('agent-preview'));
    __jait_capture(4, (service.get('agent-preview')?.sharedWithAgent));
    await service.restart('agent-preview');
    __jait_capture(5, (service.get('agent-preview')?.sharedWithAgent));
    __jait_thrown(6, () => service.assertAgentControl(service.get('agent-preview')!.browserId!));
    service.setSharedWithAgent('agent-preview', true);
    __jait_thrown(7, () => service.assertAgentControl(service.get('agent-preview')!.browserId!));
    const userPreview = await service.start({ sessionId: 'user-preview', target: '4173' });
    __jait_capture(8, (userPreview.sharedWithAgent));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_chat_test_ts_53_3": {


function fixture() {
  const surfaces = new Map<string, any>();
  const registry = {
    getSurface: (id: string) => surfaces.get(id),
    startSurface: vi.fn(async (_type: string, id: string, input: any) => {
      const browser = {
        id, type: 'browser', state: 'running', sessionId: input.sessionId,
        snapshot: () => ({ id, type: 'browser', state: 'running', sessionId: input.sessionId, metadata: {} }),
        navigate: vi.fn().mockResolvedValue({ url: 'https://example.com/', title: 'Example', text: 'Hello', elements: [], activeElement: null, dialogs: [], obstruction: null }),
        inspect: async () => ({ snapshot: { url: 'about:blank', title: '', text: '', elements: [], activeElement: null, dialogs: [], obstruction: null } }),
        getEvents: () => [], getMetrics: async () => null,
        getLiveViewInfo: () => ({ novncUrl: 'ws://localhost:6080', vncPort: 5900, websockifyPort: 6080 }),
      };
      surfaces.set(id, browser);
      return browser;
    }),
    stopSurface: vi.fn(async (id: string) => { surfaces.delete(id); }),
  };
  const service = new PreviewService(registry as any);
  const tool = createBrowserNavigateTool(registry as any, service);
  const context = (sessionId: string) => ({ sessionId, actionId: 'test', requestedBy: 'assistant', projectRoot: '/project' });
  return { registry, service, tool, context };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, tool, context } = fixture();
    const a = await tool.execute({ url: 'https://example.com' }, context('chat-a'));
    const b = await tool.execute({ url: 'https://example.com' }, context('chat-b'));
    __jait_capture(0, (a.data?.browserId), (b.data?.browserId));
    __jait_capture(1, (a.data?.browserSession));
    __jait_capture(2, (service.get('chat-a')));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_chat_test_ts_61_3": {


function fixture() {
  const surfaces = new Map<string, any>();
  const registry = {
    getSurface: (id: string) => surfaces.get(id),
    startSurface: vi.fn(async (_type: string, id: string, input: any) => {
      const browser = {
        id, type: 'browser', state: 'running', sessionId: input.sessionId,
        snapshot: () => ({ id, type: 'browser', state: 'running', sessionId: input.sessionId, metadata: {} }),
        navigate: vi.fn().mockResolvedValue({ url: 'https://example.com/', title: 'Example', text: 'Hello', elements: [], activeElement: null, dialogs: [], obstruction: null }),
        inspect: async () => ({ snapshot: { url: 'about:blank', title: '', text: '', elements: [], activeElement: null, dialogs: [], obstruction: null } }),
        getEvents: () => [], getMetrics: async () => null,
        getLiveViewInfo: () => ({ novncUrl: 'ws://localhost:6080', vncPort: 5900, websockifyPort: 6080 }),
      };
      surfaces.set(id, browser);
      return browser;
    }),
    stopSurface: vi.fn(async (id: string) => { surfaces.delete(id); }),
  };
  const service = new PreviewService(registry as any);
  const tool = createBrowserNavigateTool(registry as any, service);
  const context = (sessionId: string) => ({ sessionId, actionId: 'test', requestedBy: 'assistant', projectRoot: '/project' });
  return { registry, service, tool, context };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, tool, context, registry } = fixture();
    const first = await tool.execute({ url: 'https://example.com' }, context('chat-a'));
    const browser = registry.getSurface(first.data!.browserId as string);
    service.setSharedWithAgent('chat-a', false);
    await __jait_rejected(0, tool.execute({ url: 'https://example.com/private' }, context('chat-a')));
    __jait_capture(1, (browser.navigate.mock.calls));
    service.setSharedWithAgent('chat-a', true);
    await tool.execute({ url: 'https://example.com' }, context('chat-a'));
    __jait_capture(2, (browser.navigate.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_chat_test_ts_72_3": {


function fixture() {
  const surfaces = new Map<string, any>();
  const registry = {
    getSurface: (id: string) => surfaces.get(id),
    startSurface: vi.fn(async (_type: string, id: string, input: any) => {
      const browser = {
        id, type: 'browser', state: 'running', sessionId: input.sessionId,
        snapshot: () => ({ id, type: 'browser', state: 'running', sessionId: input.sessionId, metadata: {} }),
        navigate: vi.fn().mockResolvedValue({ url: 'https://example.com/', title: 'Example', text: 'Hello', elements: [], activeElement: null, dialogs: [], obstruction: null }),
        inspect: async () => ({ snapshot: { url: 'about:blank', title: '', text: '', elements: [], activeElement: null, dialogs: [], obstruction: null } }),
        getEvents: () => [], getMetrics: async () => null,
        getLiveViewInfo: () => ({ novncUrl: 'ws://localhost:6080', vncPort: 5900, websockifyPort: 6080 }),
      };
      surfaces.set(id, browser);
      return browser;
    }),
    stopSurface: vi.fn(async (id: string) => { surfaces.delete(id); }),
  };
  const service = new PreviewService(registry as any);
  const tool = createBrowserNavigateTool(registry as any, service);
  const context = (sessionId: string) => ({ sessionId, actionId: 'test', requestedBy: 'assistant', projectRoot: '/project' });
  return { registry, service, tool, context };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tool, context } = fixture();
    const first = await tool.execute({ url: 'https://example.com' }, context('chat-a'));
    await __jait_rejected(0, tool.execute({ url: 'https://example.com', browserId: first.data!.browserId as string }, context('chat-b')));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_chat_test_ts_77_3": {


function fixture() {
  const surfaces = new Map<string, any>();
  const registry = {
    getSurface: (id: string) => surfaces.get(id),
    startSurface: vi.fn(async (_type: string, id: string, input: any) => {
      const browser = {
        id, type: 'browser', state: 'running', sessionId: input.sessionId,
        snapshot: () => ({ id, type: 'browser', state: 'running', sessionId: input.sessionId, metadata: {} }),
        navigate: vi.fn().mockResolvedValue({ url: 'https://example.com/', title: 'Example', text: 'Hello', elements: [], activeElement: null, dialogs: [], obstruction: null }),
        inspect: async () => ({ snapshot: { url: 'about:blank', title: '', text: '', elements: [], activeElement: null, dialogs: [], obstruction: null } }),
        getEvents: () => [], getMetrics: async () => null,
        getLiveViewInfo: () => ({ novncUrl: 'ws://localhost:6080', vncPort: 5900, websockifyPort: 6080 }),
      };
      surfaces.set(id, browser);
      return browser;
    }),
    stopSurface: vi.fn(async (id: string) => { surfaces.delete(id); }),
  };
  const service = new PreviewService(registry as any);
  const tool = createBrowserNavigateTool(registry as any, service);
  const context = (sessionId: string) => ({ sessionId, actionId: 'test', requestedBy: 'assistant', projectRoot: '/project' });
  return { registry, service, tool, context };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { registry, service, context } = fixture();
    const tool = createSurfacesStartTool(registry as any, service);
    const a = await tool.execute({ type: 'browser' }, context('chat-a'));
    const b = await tool.execute({ type: 'browser' }, context('chat-a'));
    __jait_capture(0, (a.data?.browserSession));
    __jait_capture(1, (a.data?.id), (b.data?.id));
    __jait_capture(2, (registry.startSurface.mock.calls));
    service.setSharedWithAgent('chat-a', false);
    __jait_capture(3, ((await tool.execute({ type: 'browser' }, context('chat-a'))).ok));
    __jait_capture(4, (registry.startSurface.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_chat_test_ts_89_3": {


function fixture() {
  const surfaces = new Map<string, any>();
  const registry = {
    getSurface: (id: string) => surfaces.get(id),
    startSurface: vi.fn(async (_type: string, id: string, input: any) => {
      const browser = {
        id, type: 'browser', state: 'running', sessionId: input.sessionId,
        snapshot: () => ({ id, type: 'browser', state: 'running', sessionId: input.sessionId, metadata: {} }),
        navigate: vi.fn().mockResolvedValue({ url: 'https://example.com/', title: 'Example', text: 'Hello', elements: [], activeElement: null, dialogs: [], obstruction: null }),
        inspect: async () => ({ snapshot: { url: 'about:blank', title: '', text: '', elements: [], activeElement: null, dialogs: [], obstruction: null } }),
        getEvents: () => [], getMetrics: async () => null,
        getLiveViewInfo: () => ({ novncUrl: 'ws://localhost:6080', vncPort: 5900, websockifyPort: 6080 }),
      };
      surfaces.set(id, browser);
      return browser;
    }),
    stopSurface: vi.fn(async (id: string) => { surfaces.delete(id); }),
  };
  const service = new PreviewService(registry as any);
  const tool = createBrowserNavigateTool(registry as any, service);
  const context = (sessionId: string) => ({ sessionId, actionId: 'test', requestedBy: 'assistant', projectRoot: '/project' });
  return { registry, service, tool, context };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { registry, tool, context } = fixture();
    const [a, b] = await Promise.all([
      tool.execute({ url: 'https://example.com' }, context('chat-a')),
      tool.execute({ url: 'https://example.com' }, context('chat-a')),
    ]);
    __jait_capture(0, (a.data?.browserId), (b.data?.browserId));
    __jait_capture(1, (registry.startSurface.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_chat_test_ts_98_3": {


function fixture() {
  const surfaces = new Map<string, any>();
  const registry = {
    getSurface: (id: string) => surfaces.get(id),
    startSurface: vi.fn(async (_type: string, id: string, input: any) => {
      const browser = {
        id, type: 'browser', state: 'running', sessionId: input.sessionId,
        snapshot: () => ({ id, type: 'browser', state: 'running', sessionId: input.sessionId, metadata: {} }),
        navigate: vi.fn().mockResolvedValue({ url: 'https://example.com/', title: 'Example', text: 'Hello', elements: [], activeElement: null, dialogs: [], obstruction: null }),
        inspect: async () => ({ snapshot: { url: 'about:blank', title: '', text: '', elements: [], activeElement: null, dialogs: [], obstruction: null } }),
        getEvents: () => [], getMetrics: async () => null,
        getLiveViewInfo: () => ({ novncUrl: 'ws://localhost:6080', vncPort: 5900, websockifyPort: 6080 }),
      };
      surfaces.set(id, browser);
      return browser;
    }),
    stopSurface: vi.fn(async (id: string) => { surfaces.delete(id); }),
  };
  const service = new PreviewService(registry as any);
  const tool = createBrowserNavigateTool(registry as any, service);
  const context = (sessionId: string) => ({ sessionId, actionId: 'test', requestedBy: 'assistant', projectRoot: '/project' });
  return { registry, service, tool, context };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, tool, context } = fixture();
    await tool.execute({ url: 'https://example.com' }, context('chat-a'));
    service.setSharedWithAgent('chat-a', false);
    __jait_capture(0, (await service.restart('chat-a')));
    await __jait_rejected(1, tool.execute({ url: 'https://example.com' }, context('chat-a')));
  
})();

} finally {

}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}

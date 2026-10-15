/** Opt-in real Lumiverse 1.2.5 runtime/SQLite/installer/provider integration. No real user data. */
import { resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { defaultPromptTexts } from '../src/prompts';
const root = resolve(import.meta.dir, '..');
const source = process.env.LUMIVERSE_SOURCE || join(root, 'scratch', 'Lumiverse');
const data = join(root, 'scratch', `host-fixture-${Date.now()}`); mkdirSync(data, { recursive:true });
process.env.DATA_DIR = data; process.env.LUMIVERSE_SPINDLE_RUNTIME_MODE = 'process'; process.env.LUMIVERSE_SMART_MONITOR = 'false';
const load = (path:string) => import(join(source,'src',path));
const {initDatabase,closeDatabase}=await load('db/connection.ts');
const {runMigrations}=await load('db/migrate.ts');
const db=initDatabase();await runMigrations(db);
await(await load('crypto/init.ts')).initIdentity();
const user='rpgdice_test_user'; const other='rpgdice_other_user';
for(const id of [user,other])db.query('INSERT INTO "user" (id,name,email,username) VALUES (?,?,?,?)').run(id,id,`${id}@fixture.invalid`,id);
const manager=await load('spindle/manager.service.ts');
const manifest=await Bun.file(join(root,'spindle.json')).json();
let installed:any;
if(process.env.RPG_DICE_INSTALL_URL){ installed=await manager.install(process.env.RPG_DICE_INSTALL_URL,{installScope:'user',installedByUserId:user}); }
else {const files=new Map<string,Uint8Array>();for(const file of ['spindle.json','dist/backend.js','dist/frontend.js'])files.set(file,new Uint8Array(await Bun.file(join(root,file)).arrayBuffer()));installed=await manager.installFromFiles(files,{});}
for(const permission of manifest.permissions)manager.grantPermission('rpg_dice',permission);
const {WorkerHost}=await load('spindle/worker-host.ts');
const host=new WorkerHost(installed.id,await manager.getManifest('rpg_dice'),await manager.getExtension(installed.id));
const {eventBus}=await load('ws/bus.ts');const {EventType}=await load('ws/events.ts');
const events:any[]=[];eventBus.on(EventType.SPINDLE_FRONTEND_MSG,(e:any)=>events.push(e.payload.data));
const captures:any[]=[];
let invalidAux=false;
const fixtureServer=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
  const body=await request.json() as any;captures.push({path:new URL(request.url).pathname,body});
  const auxiliary=body.model==='aux-model';const content=auxiliary?(invalidAux?'JSON INVÁLIDO':JSON.stringify({roll:true,approach:'Astuto',difficulty:2,bonus:1,action:'abrir o cofre',reason:'O cofre resiste e a persona usa raciocínio; ferramentas concedem +1.'})):'A persona age conforme o resultado automático.';
  if(new URL(request.url).pathname.endsWith('/messages'))return Response.json({id:'msg_fixture',type:'message',role:'assistant',model:body.model,content:[{type:'text',text:content}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:10}});
  return Response.json({id:'chatcmpl_fixture',model:body.model,choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});
}});
const base=`http://127.0.0.1:${fixtureServer.port}/v1`;
const connections=await load('services/connections.service.ts');const personas=await load('services/personas.service.ts');const characters=await load('services/characters.service.ts');const chats=await load('services/chats.service.ts');const settings=await load('services/settings.service.ts');const generate=await load('services/generate.service.ts');
const aux=await connections.createConnection(user,{name:'Auxiliar fixture',provider:'openai',model:'profile-model',api_url:base,api_key:'fixture-only-key'});
const persona=personas.createPersona(user,{name:'Alice Fixture',description:'Aventureira investigadora com ferramentas.',is_default:true});
const character=characters.createCharacter(user,{name:'Narrador Fixture',description:'Narrador de aventura.',first_mes:'A porta do cofre está trancada.'});
const presets=await load('services/presets.service.ts');
const block=(id:string,extra:any)=>({id,name:id,content:'',role:'system',enabled:true,position:'pre_history',depth:0,marker:null,isLocked:false,color:null,injectionTrigger:[],group:null,...extra});
const preset=presets.createPreset(user,{name:'Fixture completo',provider:'openai',parameters:{},prompt_order:[block('main',{content:'Você é o narrador da aventura.'}),block('history',{marker:'chat_history'}),block('footer',{content:'Instrução final do preset.',position:'post_history'})]});
settings.putSetting(user,'activePersonaId',persona.id);settings.putSetting(user,'reasoningSettings',{apiReasoning:false});
function assert(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
async function waitUntil(predicate:()=>boolean,label:string){const start=Date.now();while(!predicate()){if(Date.now()-start>20000)throw Error(`Timeout: ${label}`);await Bun.sleep(20);}}
async function rpc(payload:any){const requestId=crypto.randomUUID();host.sendFrontendMessage({...payload,requestId},user);await waitUntil(()=>events.some(e=>e.requestId===requestId),'frontend RPC');const reply=events.find(e=>e.requestId===requestId);assert(reply.type!=='error',`RPC error ${reply.message}`);return reply;}
const terminals:any[]=[];eventBus.on(EventType.GENERATION_ENDED,(e:any)=>terminals.push({kind:'ended',...e.payload}));eventBus.on(EventType.GENERATION_STOPPED,(e:any)=>terminals.push({kind:'stopped',...e.payload}));
const report:any={dataDir:data,lumiverseSource:source,install:process.env.RPG_DICE_INSTALL_URL||'installFromFiles',cases:[]};
try{
 await host.start();await rpc({type:'save',settings:{enabled:true,connectionId:aux.id,model:'aux-model'}});
 for(const provider of ['openai','anthropic']){
  const custom={...defaultPromptTexts(),refereeSystem:`HOST_EDIT_${provider}\n${defaultPromptTexts().refereeSystem}`,mainOpening:`HOST_NOTE_${provider} character `,mainClosing:' Respect OOC; keep the recorded result. HOST_END.'};
  await rpc({type:'save',prompts:custom});
  const main=await connections.createConnection(user,{name:`Principal ${provider}`,provider,model:'main-model',api_url:base,api_key:'fixture-main-key',is_default:true});
  const chat=chats.createChat(user,{character_id:character.id,name:`Chat ${provider}`,metadata:{no_preset:true}});const action=chats.createMessage(chat.id,{is_user:true,name:persona.name,content:'Tento abrir o cofre com raciocínio e ferramentas.'},user);
  await rpc({type:'cheat',chatId:chat.id,outcome:'Sucesso Crítico'});
  const before=captures.length;const result=await generate.startGeneration({userId:user,chat_id:chat.id,connection_id:main.id,persona_id:persona.id,preset_id:preset.id,generation_type:'normal',parameters:{_streaming:false}});
  await waitUntil(()=>terminals.some(e=>e.generationId===result.generationId),`geração ${provider}`);const terminal=terminals.find(e=>e.generationId===result.generationId);assert(terminal.kind==='ended',`${provider}: geração falhou ${JSON.stringify(terminal)}`);
  const requests=captures.slice(before);assert(requests.length===2,`${provider}: esperadas 2 chamadas, recebidas ${requests.length}`);assert(requests[0].body.model==='aux-model','Auxiliar deve preceder principal');assert(requests[1].body.model==='main-model','Modelo principal foi alterado');
  assert(requests[0].body.messages[0].content===custom.refereeSystem,'System auxiliar editado não chegou intacto ao provider');
  const last=requests[1].body.messages.at(-1);const text=typeof last.content==='string'?last.content:last.content.map((p:any)=>p.text||'').join('');assert(last.role==='user','OOC não é user final');assert(text.endsWith('))')&&text.includes('Critical Success')&&text.includes('CHEAT'),'Nota final ausente no request real');
  assert(text.includes(`((HOST_NOTE_${provider}`)&&text.endsWith('HOST_END.))'),`Textos editados não chegaram à nota principal: ${provider} ${text}`);
  const view=await rpc({type:'load',chatId:chat.id});assert(view.ledger.activeCheat==='Sucesso Crítico','Cheat foi desativado indevidamente');assert(view.ledger.records[0].fudge.requested==='Sucesso Crítico','Audit cheat ausente');assert(!JSON.stringify(view).includes('fixture-only-key'),'Chave vazou para UI');
  custom.mainClosing=' Updated closing on cached result. REPLAY_NEW.';await rpc({type:'save',prompts:custom});
  const regenBefore=captures.length;const regen=await generate.startGeneration({userId:user,chat_id:chat.id,connection_id:main.id,persona_id:persona.id,preset_id:preset.id,generation_type:'regenerate',parameters:{_streaming:false}});await waitUntil(()=>terminals.some(e=>e.generationId===regen.generationId),'regenerate');assert(captures.length-regenBefore===1,'Regenerate chamou auxiliar/rerolou');
  assert(JSON.stringify(captures.at(-1).body.messages.at(-1).content).includes('REPLAY_NEW.'),'Replay ignorou texto atualizado');
  assert(JSON.stringify((await rpc({type:'load',chatId:chat.id})).ledger.records)===JSON.stringify(view.ledger.records),'Editar textos alterou resultado cacheado');
  chats.createMessage(chat.id,{is_user:true,name:persona.name,content:'Tento abrir outro cofre, uma nova ação.'},user);
  const second=await generate.startGeneration({userId:user,chat_id:chat.id,connection_id:main.id,persona_id:persona.id,preset_id:preset.id,generation_type:'normal',parameters:{_streaming:false}});await waitUntil(()=>terminals.some(e=>e.generationId===second.generationId),'segunda ação');
  const secondView=await rpc({type:'load',chatId:chat.id});assert(secondView.ledger.activeCheat==='Sucesso Crítico'&&secondView.ledger.records.length===2&&secondView.ledger.records.every((r:any)=>r.roll.outcome==='Sucesso Crítico'),'Cheat não persistiu por duas ações');
  const reset=await rpc({type:'save',chatId:chat.id,resetPrompts:true});assert(JSON.stringify(reset.state.prompts)===JSON.stringify(defaultPromptTexts()),'Reset não restaurou padrões');assert(JSON.stringify(reset.ledger)===JSON.stringify(secondView.ledger)&&JSON.stringify(reset.state.settings)===JSON.stringify(secondView.state.settings)&&JSON.stringify(reset.state.personas)===JSON.stringify(secondView.state.personas),'Reset alterou dados fora dos prompts');
  await rpc({type:'cheat',chatId:chat.id,outcome:null});assert((await rpc({type:'load',chatId:chat.id})).ledger.activeCheat===null,'Cheat não desativou manualmente');
  chats.createMessage(chat.id,{is_user:true,name:persona.name,content:'Tento abrir o terceiro cofre.'},user);invalidAux=true;
  const failBefore=captures.length;const failed=await generate.startGeneration({userId:user,chat_id:chat.id,connection_id:main.id,persona_id:persona.id,preset_id:preset.id,generation_type:'normal',parameters:{_streaming:false}});await waitUntil(()=>terminals.some(e=>e.generationId===failed.generationId),'erro auxiliar');const failure=terminals.find(e=>e.generationId===failed.generationId);assert(failure.error&&captures.length-failBefore===1,'Falha auxiliar não bloqueou principal');invalidAux=false;
  report.cases.push({provider,requests:requests.map(r=>({path:r.path,model:r.body.model,lastRole:r.body.messages.at(-1).role,lastContent:r.body.messages.at(-1).content})),editedAuxiliaryExact:true,editedMainNote:true,replayCurrentTextsOriginalResult:true,resetOnlyPrompts:true,regenerateRequests:1,messageId:action.id,history:secondView.ledger.records.length,persistentCheat:true,manualOff:true,auxFailureBlockedMain:true});
 }
 if(process.env.RPG_DICE_INSTALL_URL){await host.stop();const updated=await manager.update('rpg_dice');report.updateVersion=updated.version;}
 report.passed=true;await Bun.write(join(data,'requests.json'),JSON.stringify(captures,null,2));await Bun.write(join(data,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){report.passed=false;report.error=String(error);await Bun.write(join(data,'requests.json'),JSON.stringify(captures,null,2));await Bun.write(join(data,'report.json'),JSON.stringify(report,null,2));throw error;}finally{await host.stop();fixtureServer.stop(true);generate.stopAllGenerations();generate.stopGenerationSweep();(await load('services/generation-pool.service.ts')).stopPoolSweep();closeDatabase();}
process.exit(0);




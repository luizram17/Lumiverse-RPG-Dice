import type { SpindleAPI, InterceptorContextDTO, LlmMessageDTO } from 'lumiverse-spindle-types';
import { DiceEngine } from '../src/engine';
export const decision = { roll: true, approach: 'Astuto', difficulty: 2, bonus: 1, action: 'abrir o cofre', reason: 'Há oposição; usa raciocínio e tem ferramentas adequadas.' };
export function message(id: string, content: string, role: 'system'|'user'|'assistant' = 'user', index = 0, chatId = 'chatA') { return { id, chat_id: chatId, role, name: role === 'user' ? 'Persona' : 'NPC', index_in_chat: index, content, parent_message_id: null as string|null, branch_id:null, send_date:0,created_at:0,swipe_dates:[0],is_user: role === 'user', extra: {}, swipes: [content], swipe_id:0 }; }
export function context(userId = 'userAAAA', chatId = 'chatA', type = 'normal'): InterceptorContextDTO { return { userId, chatId, generationType: type, personaId: 'personaA', signal: new AbortController().signal, isDryRun: false } as InterceptorContextDTO; }
export function fixture() {
  const files = new Map<string,string>(); const calls: any[] = []; const writes: string[] = []; const toasts: unknown[]=[];
  const histories: Record<string, any[]> = { chatA: [message('m1', 'Tento abrir o cofre.')] }; let answer: any = { content: JSON.stringify(decision) }; let handler: ((input:any)=>Promise<any>) | undefined; let failCommit=false;
  const api = {
    host:{capabilities:{'required-interceptors-v1':1}},
    userStorage:{ exists:async(path:string,u:string)=>files.has(`${u}/${path}`), read:async(path:string,u:string)=>files.get(`${u}/${path}`)!, write:async(path:string,v:string,u:string)=>{files.set(`${u}/${path}`,v);writes.push(path);},move:async(from:string,to:string,u:string)=>{if(failCommit&&to.startsWith('chats/'))throw Error('disk failure');files.set(`${u}/${to}`,files.get(`${u}/${from}`)!);files.delete(`${u}/${from}`);writes.push(to);}},
    connections:{get:async(id:string,u:string)=>id==='aux'?{id,name:'Aux',provider:'openai',model:'profile-model',metadata:{api_key:'DO NOT SEND'},api_key:'DO NOT SEND'}:null,list:async()=>[{id:'aux',name:'Aux',provider:'openai',model:'profile-model',metadata:{api_key:'DO NOT SEND'},api_key:'DO NOT SEND'}]},
    personas:{get:async(id:string)=>({id,name:'Alice',title:'Aventureira',description:'Descrição completa',metadata:{}}),list:async()=>({data:[{id:'personaA',name:'Alice'}],total:1})},
    chat:{getMessages:async(id:string)=>structuredClone(histories[id]||[])},chats:{get:async(id:string)=>({id,name:id}),getActive:async()=>({id:'chatA',name:'Chat A'})},
    generate:{raw:async(input:any)=>{calls.push(input);return handler?handler(input):answer;}},sendToFrontend:()=>{},toast:{error:(...args:unknown[])=>toasts.push(args)}
  } as unknown as SpindleAPI;
  const engine = new DiceEngine(api,()=>[0,0,0,0]);
  const prompt = (id='m1'): LlmMessageDTO[]=>[{role:'system',content:'Prompt inteiro'}, {role:'user',content:'ação montada',__isChatHistory:true,sourceMessageId:id}];
  return { api, engine, files, histories, calls, writes, toasts, prompt, setAnswer:(a:any)=>answer=a,setHandler:(h:(i:any)=>Promise<any>)=>handler=h, setFailCommit:(v:boolean)=>failCommit=v };
}
export async function enable(f: ReturnType<typeof fixture>, userId='userAAAA') { await f.engine.configure(userId,{settings:{enabled:true,connectionId:'aux',model:'separate-model'}}); }

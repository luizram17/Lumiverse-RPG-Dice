import {expect,test,afterEach} from 'bun:test';
import {JSDOM} from 'jsdom';
import type {SpindleFrontendContext} from 'lumiverse-spindle-types';
import {setup,clampPosition} from '../src/frontend';
import {defaultScores,modelOutcomes,outcomes} from '../src/rules';
import {defaultPromptTexts,promptFields} from '../src/prompts';
function uiFixture(fallbacks=false){
 const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost'}); Object.assign(globalThis,{window:dom.window,document:dom.window.document,Option:dom.window.Option});
 const requests:any[]=[];let backend:(p:any)=>void=()=>{};let switched:()=>void=()=>{};let dragged:(p:any)=>void=()=>{};const positions:any[]=[];let position={x:20,y:30};let destroyed=0;let mounts=0;
 const root=()=>{const r=document.createElement('div');document.body.append(r);return r;};const drawer=root();const settings=root();const float=root();let modal:HTMLElement|null=null;
 const handle=(r:HTMLElement)=>({root:r,destroy:()=>{destroyed++;r.remove();},onActivate:()=>()=>{}});
 const ctx={dom:{addStyle:()=>()=>{}},ui:{registerDrawerTab:()=>handle(drawer),registerSettingsTab:()=>handle(settings),createFloatWidget:()=>({...handle(float),getPosition:()=>position,moveTo:(x:number,y:number)=>{position={x,y};positions.push(position);},onDragEnd:(h:any)=>{dragged=h;return()=>{};}}),showModal:()=>{modal=root();return{root:modal,dismiss:()=>{modal?.remove();},onDismiss:()=>()=>{}};}},components:{mountModelCombobox:(r:HTMLElement,options:any)=>{mounts++;const input=document.createElement('input');input.value=options.value;r.append(input);return{getValue:()=>input.value,destroy:()=>{mounts--;input.remove();}};}},events:{on:(_e:string,h:any)=>{switched=h;return()=>{};}},onBackendMessage:(h:any)=>{backend=h;return()=>{};},sendToBackend:(p:any)=>requests.push(p)} as unknown as SpindleFrontendContext;
 if(fallbacks){ctx.ui.registerSettingsTab=()=>{throw Error('unsupported');};ctx.ui.mount=()=>settings;ctx.ui.createFloatWidget=()=>{throw Error('permission');};ctx.components.mountModelCombobox=()=>{throw Error('missing');};}
 const cleanup=setup(ctx);const view={type:'view',state:{version:1,settings:{enabled:true,connectionId:'aux',model:'model-x'},personas:{personaA:defaultScores()},position:{x:40,y:60},prompts:defaultPromptTexts()},supported:true,connections:[{id:'aux',name:'Auxiliar',provider:'openai',model:'model-x'}],personas:[{id:'personaA',name:'Alice'}],chat:{id:'chatA',name:'Chat A'},ledger:{version:1,activeCheat:null,records:[]}};
 const reply=(data:any=view)=>backend({...data,requestId:requests.at(-1).requestId});
 return{dom,requests,drawer,settings,float,get modal(){return modal;},reply,view,drag:(p:any)=>dragged(p),switchChat:()=>switched(),positions,cleanup,get mounts(){return mounts;},get destroyed(){return destroyed;}};
}
afterEach(()=>{delete(globalThis as any).window;delete(globalThis as any).document;delete(globalThis as any).Option;});
test('UI integrada carrega modelos, salva perfil e não vaza mounts no rerender/teardown',()=>{const f=uiFixture();f.reply();expect(f.drawer.textContent).toContain('Perfil de conexão auxiliar');expect(f.mounts).toBe(2);(f.drawer.querySelector('button') as HTMLButtonElement).click();expect(f.requests.at(-1).settings.model).toBe('model-x');f.reply();expect(f.mounts).toBe(2);f.cleanup();expect(f.mounts).toBe(0);expect(f.destroyed).toBe(3);});
test('widget nativo: click abre histórico, drag só persiste posição, clamp viewport',()=>{const f=uiFixture();f.reply();f.drag({x:99999,y:-20});expect(f.requests.at(-1).type).toBe('position');expect(f.requests.at(-1).position.y).toBe(0);expect(f.modal).toBeNull();(f.float.querySelector('button') as HTMLButtonElement).click();expect(f.modal?.textContent).toContain('Cheats deste chat');expect(clampPosition({x:999,y:-5},300,200)).toEqual({x:244,y:0});f.cleanup();});
test('quatro cheats exclusivos, toggle mesmo resultado cancela, duplo clique aguarda resposta',()=>{const f=uiFixture();f.reply();(f.float.querySelector('button') as HTMLButtonElement).click();f.reply();let buttons=f.modal!.querySelectorAll('button');expect(buttons.length).toBe(4);(buttons[3] as HTMLButtonElement).click();const count=f.requests.length;(buttons[3] as HTMLButtonElement).click();expect(f.requests.length).toBe(count);expect([...buttons].every(b=>b.disabled)).toBe(true);expect(f.requests.at(-1)).toMatchObject({type:'cheat',chatId:'chatA',outcome:'Sucesso Crítico'});f.view.ledger.activeCheat='Sucesso Crítico' as any;f.reply();buttons=f.modal!.querySelectorAll('button');expect([...buttons].map(b=>b.getAttribute('aria-pressed'))).toEqual(['false','false','false','true']);(buttons[3] as HTMLButtonElement).click();expect(f.requests.at(-1).outcome).toBeNull();f.cleanup();});
test('troca chat limpa histórico antigo antes resposta e ignora resposta stale',()=>{const f=uiFixture();f.reply();(f.float.querySelector('button') as HTMLButtonElement).click();const stale=f.requests.at(-1).requestId;f.switchChat();expect(f.modal!.textContent).not.toContain('Chat A');f.reply({...f.view,requestId:stale});f.cleanup();});

test('editores reais cobrem todos os textos; prévia e slots readonly sem executar HTML/templates',()=>{
 const f=uiFixture();f.reply();const before=f.requests.length;
 expect(f.drawer.querySelectorAll('textarea[data-prompt-key]')).toHaveLength(promptFields.length);
 for(const spec of promptFields){const input=f.drawer.querySelector<HTMLTextAreaElement>(`[data-prompt-key="${spec.key}"]`)!;expect(input.readOnly).toBe(false);expect(input.maxLength).toBe(spec.limit);input.value=` ${spec.key}\n<script>bad()</script>\${literal} `;input.dispatchEvent(new f.dom.window.Event('input'));expect(f.settings.querySelector<HTMLTextAreaElement>(`[data-prompt-key="${spec.key}"]`)!.value).toBe(input.value);}
 expect(f.requests).toHaveLength(before);expect(f.drawer.querySelector('script')).toBeNull();
 const preview=f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-preview]')!;expect(preview.readOnly).toBe(true);for(const value of ['Alice','Clever','open the safe','Critical Success','effectCriticalSuccess'])expect(preview.value).toContain(value);
 const protectedFields=f.drawer.querySelectorAll<HTMLTextAreaElement>('textarea[readonly]');expect(protectedFields).toHaveLength(6);for(const input of protectedFields)input.value='tampered';
 [...f.drawer.querySelectorAll('button')].find(b=>b.textContent==='Salvar textos dos modelos')!.click();
 const sent=f.requests.at(-1);expect(Object.keys(sent.prompts)).toEqual(promptFields.map(s=>s.key));expect(JSON.stringify(sent.prompts)).not.toContain('tampered');expect(sent.prompts.refereeSystem).toContain('${literal}');
 f.view.state.prompts=sent.prompts;f.reply();expect(f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="mainOpening"]')!.value).toBe(sent.prompts.mainOpening);f.cleanup();
});

test('seletor da prévia mostra os quatro efeitos ao vivo sem salvar resultado ou cheat; histórico usa apenas textos salvos',()=>{
 const f=uiFixture();f.reply();const before=f.requests.length;const keys=['effectFailure','effectPartialSuccess','effectSuccess','effectCriticalSuccess'];
 for(const [i,outcome] of outcomes.entries()){
  const input=f.drawer.querySelector<HTMLTextAreaElement>(`[data-prompt-key="${keys[i]}"]`)!;input.value=`<img src=x onerror=bad()> efeito-${i}`;input.dispatchEvent(new f.dom.window.Event('input'));
  const selector=f.drawer.querySelector<HTMLSelectElement>('[data-preview-outcome]')!;selector.value=outcome;selector.dispatchEvent(new f.dom.window.Event('change'));
  for(const root of [f.drawer,f.settings]){expect(root.querySelector<HTMLTextAreaElement>('[data-prompt-preview]')!.value).toContain(`${modelOutcomes[outcome].label} — ${input.value}`);expect(root.querySelector<HTMLTextAreaElement>('[data-preview-category]')!.value).toBe(modelOutcomes[outcome].label);expect(root.querySelector<HTMLSelectElement>('[data-preview-outcome]')!.value).toBe(outcome);expect(root.querySelector('img')).toBeNull();}
 }
 expect(f.requests).toHaveLength(before);expect(f.view.ledger.activeCheat).toBeNull();
 const audit={personaName:'Alice',timestamp:new Date(0).toISOString(),decision:{approach:'Astuto',action:'open',reason:'risk'},roll:{outcome:'Falha',meaning:'snapshot original',dice:[0,0,0,0],diceTotal:0,attribute:2,bonus:1,total:3,difficulty:4}};
 f.view.ledger.records.push(audit as never);f.view.state.prompts.effectFailure='saved effect';(f.float.querySelector('button') as HTMLButtonElement).click();
 expect(f.modal!.textContent).toContain('Efeito (texto atual): saved effect');expect(f.modal!.textContent).not.toContain('efeito-0');expect(audit.roll.meaning).toBe('snapshot original');
 [...f.drawer.querySelectorAll('button')].find(b=>b.textContent==='Salvar textos dos modelos')!.click();expect(f.requests.at(-1).outcome).toBeUndefined();expect(f.requests.at(-1).prompts.previewOutcome).toBeUndefined();expect(f.requests.at(-1).prompts.effectFailure).toContain('efeito-0');f.cleanup();
});

test('rascunho resiste a auditoria/erro; reset explícito salva somente textos e defaults legados carregam',()=>{
 const f=uiFixture();delete(f.view.state as any).prompts;f.reply();
 f.drawer.querySelector<HTMLDetailsElement>('[data-prompt-editor]')!.open=true;
 let input=f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="refereeSystem"]')!;expect(input.value).toBe(defaultPromptTexts().refereeSystem);input.value='unsaved referee';input.dispatchEvent(new f.dom.window.Event('input'));
 f.reply();expect(f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="refereeSystem"]')!.value).toBe('unsaved referee');expect(f.drawer.querySelector<HTMLDetailsElement>('[data-prompt-editor]')!.open).toBe(true);
 [...f.drawer.querySelectorAll('button')].find(b=>b.textContent==='Salvar textos dos modelos')!.click();f.reply({type:'error',message:'erro fixture'});expect(f.drawer.textContent).toContain('erro fixture');expect(f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="refereeSystem"]')!.value).toBe('unsaved referee');
 [...f.drawer.querySelectorAll('button')].find(b=>b.textContent==='Restaurar e salvar textos padrão')!.click();expect(f.requests.at(-1)).toMatchObject({type:'save',resetPrompts:true});expect(f.requests.at(-1).settings).toBeUndefined();expect(f.requests.at(-1).personaId).toBeUndefined();f.view.state.prompts=defaultPromptTexts();f.reply();expect(f.drawer.querySelector<HTMLTextAreaElement>('[data-prompt-key="refereeSystem"]')!.value).toBe(defaultPromptTexts().refereeSystem);f.cleanup();
});

test('patch host preservado: settings fallback, float sem permissão e modelo sem componente ainda configuram',()=>{
 const f=uiFixture(true);f.reply();expect(f.drawer.textContent).toContain('Dado flutuante indisponível');expect(f.drawer.querySelectorAll('[data-prompt-key]')).toHaveLength(promptFields.length);expect(f.settings.querySelectorAll('[data-prompt-key]')).toHaveLength(promptFields.length);const model=f.drawer.querySelector<HTMLInputElement>('input[placeholder="ID exato do modelo"]')!;model.value='fallback-model';model.dispatchEvent(new f.dom.window.Event('input'));[...f.drawer.querySelectorAll('button')].find(b=>b.textContent==='Salvar configurações')!.click();expect(f.requests.at(-1).settings.model).toBe('fallback-model');f.cleanup();
});



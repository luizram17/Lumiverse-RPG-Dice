import { expect, test } from 'bun:test';
import { attributes, defaultSheet, d10Dice, forcedOoc, forceOutcome, outcomes, parseDecision, resolveRoll, selectSkill, validateSheet, type Skill } from '../src/rules';
const skill = (id: string, bonus: number): Skill => ({ id, name: id, description: 'Carpintaria e madeira', bonus });
test('seis atributos assinados e skills sem teto de jogo ou quantidade', () => {
  expect(Object.keys(defaultSheet().attributes)).toEqual([...attributes]); expect(Object.values(defaultSheet().attributes)).toEqual([0,0,0,0,0,0]);
  const sheet = { attributes: { ...defaultSheet().attributes, STRENGTH: -9, WISDOM: 1000000 }, skills: Array.from({ length: 550 }, (_, i) => skill(`s${i}`, i * 200)) };
  expect(validateSheet(sheet)).toEqual(sheet);
  for (const n of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => validateSheet({ ...sheet, attributes: { ...sheet.attributes, STRENGTH: n } })).toThrow();
  expect(() => validateSheet({ ...sheet, skills: [skill('same',2),skill('same',3)] })).toThrow();
});
test('uma skill direta de maior bônus; indireta só como alternativa e metade exata', () => {
  const sheet = { ...defaultSheet(), skills: [skill('small',2),skill('large',5),skill('indirect',99),skill('odd',3)] };
  expect(selectSkill(sheet,[{id:'small',relevance:'full'},{id:'large',relevance:'full'},{id:'indirect',relevance:'partial'}])?.appliedBonus).toBe(5);
  const partial = selectSkill(sheet,[{id:'small',relevance:'partial'},{id:'odd',relevance:'partial'}])!;
  expect(partial.id).toBe('odd'); expect(partial.appliedBonus).toBe(1.5);
  expect(resolveRoll([5,5],-2,partial,10).total).toBe(9.5); expect(selectSkill(sheet,[])).toBeUndefined();
  const negative=selectSkill({...defaultSheet(),skills:[skill('negative',-3)]},[{id:'negative',relevance:'partial'}]);
  expect(negative?.appliedBonus).toBe(-1.5);expect(resolveRoll([5,5],-2,negative,10).total).toBe(6.5);
  expect(() => selectSkill(sheet,[{id:'invented',relevance:'full'}])).toThrow('não pertence');
});
test('limites parcial/sucesso/falha e sem crítico por margem alta', () => {
  expect(resolveRoll([5,5],0,undefined,15).outcome).toBe('Falha');
  expect(resolveRoll([5,5],0,undefined,14).outcome).toBe('Sucesso Parcial');
  expect(resolveRoll([5,5],0,undefined,11).outcome).toBe('Sucesso Parcial');
  expect(resolveRoll([5,5],0,undefined,10).outcome).toBe('Sucesso');
  expect(resolveRoll([9,10],1000000,undefined,5).outcome).toBe('Sucesso');
  expect(resolveRoll([10,10],-9999,undefined,9999).outcome).toBe('Sucesso Crítico');
  let critical = 0; for (let a=1;a<=10;a++) for(let b=1;b<=10;b++) if(resolveRoll([a,b],0,undefined,15).outcome==='Sucesso Crítico') critical++;
  expect(critical).toBe(1);
});
test('2d10 rejeita250..255 e mapeia25 bytes por face sem viés', () => {
  const counts = Array(10).fill(0); for(let b=0;b<250;b++) counts[d10Dice(a=>{a.fill(b);return a;})[0]-1]++;
  expect(counts).toEqual(Array(10).fill(25)); let calls=0;
  expect(d10Dice(a=>{a.fill(255);if(++calls===2)a.set([250,251,252,253,254,255,0,9]);return a;})).toEqual([1,10]);
  expect(() => d10Dice(a=>{a.fill(250);return a;})).toThrow('Fonte aleatória');
});
test('parser aceita IDs relevantes; valores usados vêm da ficha, não do modelo', () => {
  const valid = {roll:true,attribute:'STRENGTH' as const,difficulty:20,skillCandidates:[{id:'wood',relevance:'partial' as const}],action:'break the door',reason:'wooden door resists'};
  expect(parseDecision(JSON.stringify({...valid,total:900,bonus:999}))).toEqual(valid);
  for(const patch of [{difficulty:0},{difficulty:1.5},{attribute:'Astuto'},{skillCandidates:[{id:'x',relevance:'other'}]},{skillCandidates:[{id:'x',relevance:'full'},{id:'x',relevance:'partial'}]},{reason:''},{roll:'true'}]) expect(()=>parseDecision(JSON.stringify({...valid,...patch}))).toThrow();
  expect(parseDecision('```json\n{"roll":false,"reason":"mundane"}\n```')).toEqual({roll:false,reason:'mundane'});
});
test('OOC prioritário e perguntas/condicionais preservadas para auxiliar', () => {
  for(const s of ['Ele aceita','sem rolagem','Não role.','sucesso garantido']) expect(forcedOoc(`negocio ((${s}))`)).toBe(true);
  for(const s of ['ele aceita?','ele aceita se eu passar no teste','narre em terceira pessoa']) expect(forcedOoc(`negocio ((${s}))`)).toBe(false);
});
test('cheats preservam sorteio natural e podem forçar qualquer categoria', () => {
  for(const outcome of outcomes){const natural=resolveRoll([1,2],-2,undefined,20);const forced=forceOutcome(natural,outcome);expect(forced.roll.outcome).toBe(outcome);expect(forced.roll.dice).toEqual([1,2]);expect(forced.roll.total).toBe(1);expect(forced.fudge.naturalOutcome).toBe('Falha');}
  expect(forceOutcome(resolveRoll([10,10],0,undefined,20),'Falha').roll.outcome).toBe('Falha');
});
test('valores inválidos e overflow interrompem em vez de inventar total', () => {
  for(const dice of [[0,10],[11,1],[1,1,1,1],[1.5,2]]) expect(()=>resolveRoll(dice,0,undefined,10)).toThrow();
  expect(()=>resolveRoll([5,5],Number.MAX_SAFE_INTEGER,undefined,10)).toThrow('precisão');
});

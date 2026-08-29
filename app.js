const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const loginScreen=$('#loginScreen'), appScreen=$('#appScreen'), toast=$('#toast');
const pages={
  encontrar:['FASE 01','Encontrar'],investigar:['FASE 02','Investigar'],validar:['FASE 03','Validar'],analisar:['FASE 04','Analisar'],simular:['FASE 05','Simular'],ranquear:['FASE 06','Ranquear'],decidir:['FASE 07','Decidir']
};
const demo=[
 {id:1,type:'imovel',title:'Apartamento 2 dormitórios',city:'Campinas • Cambuí',price:420000,market:510000,risk:28},
 {id:2,type:'carro',title:'SUV 2023 • baixa quilometragem',city:'Campinas',price:118000,market:132000,risk:20},
 {id:3,type:'terreno',title:'Terreno residencial 360 m²',city:'Valinhos',price:265000,market:315000,risk:35},
 {id:4,type:'moto',title:'Moto touring 2024',city:'Campinas',price:44900,market:49800,risk:18},
 {id:5,type:'barco',title:'Lancha 22 pés',city:'São Paulo',price:179000,market:215000,risk:42}
].map(o=>({...o,score:Math.round(((o.market-o.price)/o.market*100)*1.4 + (100-o.risk)*.55)}));
let selected=null;
function showToast(msg){toast.textContent=msg;toast.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove('show'),1800)}
function enterApp(){loginScreen.classList.remove('active');appScreen.classList.add('active');route('encontrar');renderResults(demo)}
$('#loginForm').addEventListener('submit',e=>{e.preventDefault();enterApp()});
$('#createBtn').addEventListener('click',()=>showToast('Cadastro será conectado na etapa de autenticação.'));
$('#forgotBtn').addEventListener('click',()=>showToast('Recuperação de senha será conectada ao backend.'));
$('#logoutBtn').addEventListener('click',()=>{appScreen.classList.remove('active');loginScreen.classList.add('active')});
$$('[data-route]').forEach(b=>b.addEventListener('click',()=>route(b.dataset.route)));
$$('[data-next]').forEach(b=>b.addEventListener('click',()=>route(b.dataset.next)));
function route(name){
  $$('.route').forEach(p=>p.classList.toggle('active',p.dataset.page===name));
  $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.route===name));
  $('#phaseKicker').textContent=pages[name][0]; $('#phaseTitle').textContent=pages[name][1];
  if(name==='investigar') renderInvestigate(); if(name==='validar') renderValidate(); if(name==='analisar') renderAnalyze(); if(name==='simular') renderSimulator(); if(name==='ranquear') renderRanking(); if(name==='decidir') renderDecision();
}
function money(v){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(v)}
function renderResults(list){const box=$('#results'); box.innerHTML=list.map(o=>`<article class="result-card"><div><span class="type">${o.type.toUpperCase()}</span><h3>${o.title}</h3><p>${o.city}</p></div><div><div class="price">${money(o.price)}</div><div class="score">Score ${o.score}</div></div><button class="secondary pick" data-id="${o.id}">USAR NO REALIZE</button></article>`).join(''); $$('.pick',box).forEach(b=>b.addEventListener('click',()=>{selected=demo.find(x=>x.id==b.dataset.id);showToast('Oportunidade adicionada ao fluxo');route('investigar')}))}
$('#searchBtn').addEventListener('click',()=>{let cat=$('#category').value, loc=$('#location').value.trim().toLowerCase(), max=Number($('#maxPrice').value)||Infinity; let list=demo.filter(o=>(cat==='todos'||o.type===cat)&&(!loc||o.city.toLowerCase().includes(loc))&&o.price<=max);renderResults(list);showToast(`${list.length} oportunidade(s) de demonstração`) });
function renderInvestigate(){
 $('#investigateSummary').textContent=selected?`${selected.title} • ${selected.city} • ${money(selected.price)}`:'Escolha uma oportunidade em Encontrar para iniciar.';
 const items=['Origem do anúncio','Documentação','Débitos/ônus','Ocupação','Vistoria','Condições de venda'];
 $('#checklist').innerHTML=items.map((x,i)=>`<div class="check"><h3>${x}</h3><p id="st${i}">Não verificado</p><button class="secondary ck" data-i="${i}">MARCAR VERIFICADO</button></div>`).join('');
 $$('.ck').forEach(b=>b.addEventListener('click',()=>{let p=$(`#st${b.dataset.i}`);p.textContent=p.textContent==='Verificado'?'Não verificado':'Verificado';p.style.color=p.textContent==='Verificado'?'#36e7d4':''}))
}
function renderValidate(){let r=selected?.risk??50;$('#riskGrid').innerHTML=[['Risco jurídico',r],['Risco financeiro',Math.max(10,r-8)],['Liquidez',selected?100-r:50]].map(([a,v])=>`<div class="metric"><h3>${a}</h3><strong>${v}/100</strong><p>Triagem demonstrativa.</p></div>`).join('')}
function renderAnalyze(){if(!selected){$('#analysisMetrics').innerHTML='';$('#analysisText').textContent='Selecione uma oportunidade.';return}let disc=Math.round((selected.market-selected.price)/selected.market*100);$('#analysisMetrics').innerHTML=`<div class="metric"><h3>Preço</h3><strong>${money(selected.price)}</strong></div><div class="metric"><h3>Mercado estimado</h3><strong>${money(selected.market)}</strong></div><div class="metric"><h3>Desconto</h3><strong>${disc}%</strong></div>`;$('#analysisText').textContent=`Neste cenário demonstrativo, o ativo está ${disc}% abaixo da referência simulada de mercado. Antes de decidir, confirme documentos e comparáveis reais.`}
function renderSimulator(){if(selected){$('#simBuy').value=selected.price;$('#simSell').value=selected.market}calc()}
function calc(){let b=Number($('#simBuy').value)||0,c=Number($('#simCosts').value)||0,s=Number($('#simSell').value)||0,profit=s-b-c,roi=b?profit/(b+c)*100:0;$('#simMetrics').innerHTML=`<div class="metric"><h3>Lucro</h3><strong>${money(profit)}</strong></div><div class="metric"><h3>ROI</h3><strong>${roi.toFixed(1)}%</strong></div><div class="metric"><h3>Capital total</h3><strong>${money(b+c)}</strong></div>`}
$('#calcBtn').addEventListener('click',calc);
function renderRanking(){let list=[...demo].sort((a,b)=>b.score-a.score);$('#rankingList').innerHTML=list.map((o,i)=>`<div class="ranking-row"><div class="ranking-num">${i+1}</div><div><b>${o.title}</b><small>${o.city} • ${money(o.price)}</small></div><div class="score">${o.score}</div></div>`).join('')}
function renderDecision(){if(!selected){$('#decisionTitle').textContent='Aguardando oportunidade';$('#decisionText').textContent='Selecione um ativo e percorra as fases.';$('#decisionScore').textContent='--';return}$('#decisionTitle').textContent=selected.score>=70?'Prosseguir para diligência real':selected.score>=55?'Aguardar validações':'Descartar na triagem';$('#decisionText').textContent='Recomendação demonstrativa baseada em preço, risco e potencial. Não substitui diligência jurídica ou financeira.';$('#decisionScore').textContent=selected.score}

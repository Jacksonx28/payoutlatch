import {DemoLedger,formatNear} from './model.mjs';
const $=s=>document.querySelector(s), ledger=new DemoLedger();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let filter='All',receiptId, toastTimer, search='', tourId=null, tourDraft=false, tourSeen=false, failureId=null;
const motion=window.gsap, media=window.matchMedia('(prefers-reduced-motion: reduce)');
const animate=(target,vars)=>{if(motion&&!media.matches)motion.fromTo(target,{opacity:0,y:10},{opacity:1,y:0,duration:.35,ease:'power2.out',...vars});};
media.addEventListener('change',()=>{if(media.matches&&motion){motion.globalTimeline.getChildren().forEach(t=>t.progress(1));}});
for(const job of [{id:'launch-edit-01',title:'Launch film · Final edit',recipient:'ada-editor.testnet',amount:'0.5'},{id:'brand-kit-01',title:'Brand kit · Handoff',recipient:'tomi-design.testnet',amount:'0.8'},{id:'sound-mix-01',title:'Sound mix · Episode 04',recipient:'sam-audio.testnet',amount:'0.25'}]) ledger.approve(job);
const old=ledger.start('sound-mix-01');ledger.settle('sound-mix-01',old);
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';animate('#toast');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4500);}
function render(){
  const total=status=>ledger.jobs.filter(j=>j.status===status).reduce((n,j)=>n+BigInt(j.amount),0n).toString();
  $('#ready-total').textContent=formatNear(total('Approved'))+' NEAR';$('#paid-total').textContent=formatNear(total('Paid'))+' NEAR';
  $('#ready-count').textContent=ledger.jobs.filter(j=>j.status==='Approved').length+' approved jobs';$('#job-count').textContent=ledger.jobs.length;
  $('#agent-status').classList.toggle('revoked',!ledger.enabled);$('#agent-status').textContent=ledger.enabled?'● Enabled':'○ Revoked';$('#toggle-agent').textContent=ledger.enabled?'Revoke access ↗':'Enable access ↗';
  const jobs=ledger.jobs.filter(j=>(filter==='All'||j.status===filter)&&[j.title,j.id,j.recipient].some(v=>v.toLowerCase().includes(search)));
  document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
  $('#job-rows').innerHTML=jobs.map(j=>`<tr><td><strong>${esc(j.title)}</strong><small>${esc(j.id)}</small></td><td data-label="Recipient">${esc(j.recipient)}</td><td data-label="Amount">${formatNear(j.amount)} <span class="muted">NEAR</span></td><td><span class="status ${j.status}">${j.status==='Approved'?'Ready to pay':j.status==='RefundPending'?'Refund pending':j.status}</span></td><td><div class="row-actions">${j.status==='Approved'?`<button data-action="pay" ${ledger.enabled?'':'disabled title="Enable agent access to pay"'} data-id="${esc(j.id)}">Pay ↗</button><button data-action="cancel" data-id="${esc(j.id)}">Cancel</button>`:j.status==='Pending'||j.status==='RefundPending'?`<span class="muted">Processing…</span>`:`<button data-action="receipt" data-id="${esc(j.id)}">View receipt ↗</button>`}</div></td></tr>`).join('')||'<tr><td colspan="5">No payouts match. Try another search or filter.</td></tr>';
  renderTour();renderFailure();
  $('#events').innerHTML=ledger.events.slice(0,20).map(e=>`<li>${esc(e.message)}<time>${esc(e.time)}</time></li>`).join('');
}
async function pay(id,refund=false,fail=false){
  try{const attempt=ledger.start(id,refund?'Owner':'Agent A',refund);render();await new Promise(r=>setTimeout(r,1100));ledger.settle(id,attempt,!fail,refund);render();toast(fail?'Transfer failed. The approved job can be retried.':refund?'Sample funds returned to owner.':'✓ Payment latched. One job, paid once.');}catch(e){ledger.event(e.message);render();toast(e.message);}
}
$('#job-rows').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const {id,action}=b.dataset;if(action==='receipt')showReceipt(id);else pay(id,action==='cancel');});
function showReceipt(id){receiptId=id;if(id===tourId){tourSeen=true;renderTour();}const j=ledger.get(id);$('#receipt').innerHTML=(j.status==='Paid'?'<div class="receipt-seal" aria-hidden="true">✓</div>':'')+'<p>Simulation receipt · Not proof of an onchain payment.</p>'+Object.entries({'Job':j.title,'Milestone ID':j.id,'Recipient':j.recipient,'Amount':formatNear(j.amount)+' NEAR','Status':j.status,'Attempts':j.attempt}).map(([k,v])=>`<div class="receipt-field"><span>${esc(k)}</span>${esc(v)}</div>`).join('');$('#receipt-dialog').showModal();animate('.receipt-seal',{scale:1,rotation:0});}
$('#download-receipt').onclick=()=>{const blob=new Blob([JSON.stringify({mode:'simulation',onchain:false,...ledger.get(receiptId)},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`payoutlatch-sample-${receiptId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#new-job').onclick=()=>{tourDraft=false;$('#job-form').reset();$('#form-error').textContent='';$('#job-dialog').showModal();};
$('#job-form').onsubmit=e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(e.target));ledger.approve(data);if(tourDraft){tourId=data.id;tourDraft=false;tourSeen=false;}search='';$('#search').value='';filter='All';document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('selected',b.dataset.filter===filter));render();$('#job-dialog').close();e.target.reset();toast('Job approved. Recipient and amount are locked.');}catch(err){$('#form-error').textContent=err.message;}};
document.querySelectorAll('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('selected',x===b));render();});
$('#toggle-agent').onclick=()=>{ledger.enabled=!ledger.enabled;ledger.event(`Agent access ${ledger.enabled?'enabled':'revoked'}. In-flight payments are unaffected.`);render();};
$('#guide').onclick=()=>$('#guide-dialog').showModal();
$('#search').addEventListener('input',e=>{search=e.target.value.trim().toLowerCase();render();});
$('#race').onclick=async()=>{
  if(!ledger.enabled){toast('Enable agent access before running this demo.');return;}
  const b=$('#race');b.disabled=true;b.textContent='Putting the latch to work…';
  if(motion) { motion.killTweensOf('.race-diagram *'); motion.set('.request-a,.request-b,.race-lock,.race-receipt',{clearProps:'all'}); }
  const id='race-'+Date.now();
  ledger.approve({id,title:'Double-tap test · Contractor payout',recipient:'demo-editor.testnet',amount:'0.1'});
  const attempt=ledger.start(id,'Agent A');
  try{ledger.start(id,'Agent B');}catch(e){ledger.event(e.message);}
  render();
  $('#race-status').textContent='A is processing. B is blocked: this job is already locked.';
  if(motion&&!media.matches){
    motion.timeline().to('.request-a',{x:12,opacity:.45,duration:.35}).to('.request-b',{x:10,duration:.2},.1).to('.request-b',{x:-5,duration:.1,repeat:3,yoyo:true}).to('.race-lock',{rotation:0,scale:1.08,duration:.25},.3);
  }
  await new Promise(r=>setTimeout(r,1400));
  ledger.settle(id,attempt);render();
  $('#race-status').textContent='✓ 2 requests. 1 sample payout. 0.1 NEAR paid once.';
  if(motion&&!media.matches)motion.fromTo('.race-receipt',{scale:.8,rotation:-12},{scale:1,rotation:-5,duration:.55,ease:'back.out(2)'});
  b.disabled=false;b.textContent='Try the latch again ↻';toast('Payment latched. Agent A paid once; Agent B was blocked.');
};
function renderTour(){
 const job=tourId?ledger.get(tourId):null;
 const cancelled=job?.status==='Cancelled';
 const complete=job?.status==='Paid';
 const pending=job?.status==='Pending'||job?.status==='RefundPending';
 const count=!job||cancelled?0:complete?(tourSeen?3:2):1;
 $('#tour-progress').textContent=count+' / 3 complete';
 ['approve','pay','receipt'].forEach((step,i)=>{const el=$('#tour-'+step);el.classList.toggle('done',i<count);el.classList.toggle('current',i===count);el.querySelector('b').textContent=i<count?'✓':i+1;});
 const b=$('#tour-next');b.disabled=pending;
 b.textContent=!job||cancelled?'Start with a sample job →':pending?'Waiting for the sample result…':complete?(tourSeen?'Open your sample receipt ↗':'Open the receipt →'):'Pay this sample job →';
 $('#tour-message').textContent=!job?'We’ll prefill the form. You review and approve it.':cancelled?'You cancelled this job. Start a new sample whenever you’re ready.':pending?'Your job is locked. A repeated request cannot start a second payment.':complete?(tourSeen?'You’ve completed a payout. Try the double-tap test below to see a duplicate blocked.':'Payment confirmed in the simulation. Open the receipt to finish.'):'Approved: '+formatNear(job.amount)+' NEAR to '+job.recipient+'. '+(ledger.enabled?'Next, send the sample payout.':'Enable agent access in the card below before paying.');
}
$('#tour-next').onclick=()=>{
 const job=tourId?ledger.get(tourId):null;
 if(!job||job.status==='Cancelled'){
   tourDraft=true;$('#job-form').reset();$('#form-error').textContent='';
   const fields=$('#job-form').elements;
   fields.title.value='Launch video · Ada’s final edit';fields.id.value='first-payout-'+Date.now();fields.recipient.value='ada-editor.testnet';fields.amount.value='0.5';
   $('#job-dialog').showModal();
 }else if(job.status==='Paid')showReceipt(tourId);else pay(tourId);
};
function renderFailure(){
 const job=failureId?ledger.get(failureId):null;
 $('#failure-demo').disabled=job?.status==='Pending'||job?.status==='RefundPending';
 $('#failure-demo').textContent=!job?'Try a failed payment →':job.status==='Pending'?'Processing sample transfer…':job.status==='Approved'?'Retry the same job →':'Try another failure →';
 if(job)$('#failure-status').textContent=job.status==='Approved'?'Confirmed failure. No sample payment was made. This same job can be retried.':job.status==='Paid'?'Recovered: one sample payout, using the original job ID.':job.status==='Cancelled'?'This sample job was cancelled. You can start a new scenario.':'The job stays locked until the result is confirmed.';
}
$('#failure-demo').onclick=async()=>{
 if(!ledger.enabled){toast('Enable agent access before trying this scenario.');return;}
 const job=failureId?ledger.get(failureId):null;
 if(job?.status==='Approved'){await pay(failureId);return;}
 failureId='recovery-'+Date.now();
 ledger.approve({id:failureId,title:'Recovery test · Contractor payout',recipient:'recovery-editor.testnet',amount:'0.1'});
 await pay(failureId,false,true);
};
function navigate(){
 const hash=location.hash.slice(1)||'overview';
 const route=['learn','first-payout','playground','questions'].includes(hash)?'learn':['jobs','activity'].includes(hash)?'jobs':hash==='network'?'network':'overview';
 document.querySelectorAll('[data-view]').forEach(view=>view.hidden=view.dataset.view!==route);
 document.querySelectorAll('[data-route]').forEach(link=>{const current=link.dataset.route===route;link.classList.toggle('active',current);if(current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 const titles={overview:'One approval. One payout.',jobs:'Workspace',learn:'Field guide',network:'Network & readiness'};
 document.title='PayoutLatch — '+titles[route];
 const view=document.querySelector('[data-view="'+route+'"]');
 if(motion&&!media.matches){motion.killTweensOf(view);motion.fromTo(view,{opacity:.4,y:5},{opacity:1,y:0,duration:.25,ease:'power2.out'});}
 requestAnimationFrame(()=>{if(['first-payout','playground','questions','activity'].includes(hash))document.getElementById(hash)?.scrollIntoView({block:'start'});else window.scrollTo(0,0);});
}
history.scrollRestoration='manual';
document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');if(!link||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();history.pushState(null,'',link.getAttribute('href'));navigate();});
window.addEventListener('popstate',navigate);
window.addEventListener('hashchange',navigate);
window.addEventListener('load',navigate);
render();navigate();

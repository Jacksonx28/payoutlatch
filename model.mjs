export const ONE = 10n ** 24n;
export function toYocto(value) {
  if (!/^(0|[1-9]\d*)(\.\d{1,24})?$/.test(value)) throw Error('Enter a positive NEAR amount, up to 24 decimals.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * ONE + BigInt(fraction.padEnd(24, '0'));
  if (amount <= 0n) throw Error('Amount must be positive.');
  return amount.toString();
}
export function formatNear(amount) {
  const n = BigInt(amount); const f=(n%ONE).toString().padStart(24,'0').replace(/0+$/, '');
  return `${n/ONE}${f ? '.'+f : ''}`;
}
export class DemoLedger {
  constructor() { this.jobs = []; this.events=[]; this.enabled=true; }
  event(message) { this.events.unshift({message, time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}); }
  approve({id,title,recipient,amount}) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw Error('Use 1–64 letters, numbers, underscores or hyphens for the job ID.');
    if (this.jobs.some(j=>j.id===id)) throw Error('This job ID already exists. Open its receipt instead.');
    if (!/^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/.test(recipient)) throw Error('Enter a named .testnet recipient.');
    if (!title.trim() || title.length>120) throw Error('Add a job title, up to 120 characters.');
    this.jobs.push({id,title,recipient,amount:toYocto(amount),status:'Approved',attempt:0});
    this.event(`${id}: approved for ${recipient}.`);
  }
  get(id) { const j=this.jobs.find(j=>j.id===id); if(!j) throw Error('Unknown job.'); return j; }
  start(id, actor='Agent A', refund=false) {
    if (!refund && !this.enabled) throw Error('Agent access is revoked.');
    const job=this.get(id);
    if(job.status!=='Approved') throw Error(`${actor} blocked: job is ${job.status.toLowerCase()}.`);
    job.status=refund?'RefundPending':'Pending'; job.attempt++;
    this.event(`${actor}: ${refund?'refund':'payment'} pending for ${id}.`);
    return job.attempt;
  }
  settle(id,attempt,success=true,refund=false) {
    const j=this.get(id);
    if(j.attempt!==attempt || j.status!==(refund?'RefundPending':'Pending')) throw Error('Stale result ignored.');
    j.status=success?(refund?'Cancelled':'Paid'):'Approved';
    this.event(`${id}: ${success?(refund?'funds returned to owner.':'payment confirmed. Receipt ready.'):'transfer failed; funds available for retry.'}`);
  }
}

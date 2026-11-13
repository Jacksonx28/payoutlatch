use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;

const STORAGE_RESERVE: u128 = 20_000_000_000_000_000_000_000;
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum Status { Approved, Pending, Paid, RefundPending, Cancelled }
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Job {
    pub job_id: String,
    pub reference: String,
    pub title: String,
    pub owner: AccountId,
    pub executor: Option<AccountId>,
    pub recipient: AccountId,
    pub amount: U128,
    pub status: Status,
    pub attempt: u64,
    pub created_at: u64,
    pub updated_at: u64,
}
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct PayoutLatch {
    jobs: LookupMap<String, Job>,
    owner_counts: LookupMap<AccountId, u64>,
    owner_index: LookupMap<String, String>,
}
#[near]
impl PayoutLatch {
    #[init]
    pub fn new() -> Self {
        Self { jobs: LookupMap::new(b"j"), owner_counts: LookupMap::new(b"c"), owner_index: LookupMap::new(b"i") }
    }
    // Reference uniqueness is scoped to the funding owner. Other wallets cannot squat it.
    #[payable]
    pub fn approve_job(&mut self, reference: String, title: String, recipient: AccountId,
        amount: U128, executor: Option<AccountId>) -> String {
        require!(!reference.is_empty() && reference.len() <= 64 && reference.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'), "Reference: 1-64 letters, digits, hyphens or underscores");
        require!(!title.trim().is_empty() && title.len() <= 120, "Title must be 1-120 bytes");
        require!(recipient != env::current_account_id(), "Cannot pay this contract");
        require!(amount.0 > 0, "Amount must be positive");
        let deposit = amount.0.checked_add(STORAGE_RESERVE).expect("Amount overflow");
        require!(env::attached_deposit().as_yoctonear() == deposit, "Attach amount plus 0.02 NEAR storage reserve");
        let owner = env::predecessor_account_id();
        let job_id = format!("{}:{}", owner, reference);
        require!(self.jobs.get(&job_id).is_none(), "Job ID already exists");
        let count = self.owner_counts.get(&owner).unwrap_or(0);
        let now = env::block_timestamp_ms();
        self.jobs.insert(&job_id, &Job { job_id:job_id.clone(), reference, title, owner:owner.clone(), executor, recipient, amount, status:Status::Approved, attempt:0, created_at:now, updated_at:now });
        self.owner_index.insert(&format!("{}:{}",owner,count), &job_id);
        self.owner_counts.insert(&owner, &count.checked_add(1).expect("Job count overflow"));
        self.emit(&job_id, "approved");
        job_id
    }
    pub fn set_executor(&mut self, job_id: String, executor: Option<AccountId>) {
        let mut job = self.jobs.get(&job_id).expect("Unknown job");
        require!(env::predecessor_account_id() == job.owner, "Owner only");
        require!(job.status == Status::Approved, "Change executor only before execution");
        job.executor = executor;
        job.updated_at = env::block_timestamp_ms();
        self.jobs.insert(&job_id, &job);
        self.emit(&job_id,"executor_updated");
    }
    pub fn execute(&mut self, job_id: String) -> Promise {
        let job = self.jobs.get(&job_id).expect("Unknown job");
        let caller=env::predecessor_account_id();
        require!(caller == job.owner || job.executor.as_ref() == Some(&caller), "Executor not authorized");
        self.start_transfer(job_id,false)
    }
    pub fn cancel(&mut self, job_id: String) -> Promise {
        let job=self.jobs.get(&job_id).expect("Unknown job");
        require!(env::predecessor_account_id() == job.owner, "Owner only");
        self.start_transfer(job_id,true)
    }
    #[private]
    pub fn on_transfer(&mut self, job_id: String, attempt: u64, refund: bool,
        #[callback_result] result: Result<(), PromiseError>) -> bool {
        let mut job=self.jobs.get(&job_id).expect("Unknown job");
        let expected=if refund {Status::RefundPending} else {Status::Pending};
        require!(job.status==expected && job.attempt==attempt,"Stale callback");
        let success=result.is_ok();
        job.status=if success {if refund {Status::Cancelled} else {Status::Paid}} else {Status::Approved};
        job.updated_at=env::block_timestamp_ms();
        self.jobs.insert(&job_id,&job);
        self.emit(&job_id,if success {if refund {"cancelled"} else {"paid"}} else {"transfer_failed"});
        success
    }
    pub fn get_job(&self, job_id: String) -> Option<Job> { self.jobs.get(&job_id) }
    pub fn get_job_count(&self, owner: AccountId) -> u64 { self.owner_counts.get(&owner).unwrap_or(0) }
    pub fn get_jobs(&self, owner: AccountId, from_index: Option<u64>, limit: Option<u64>) -> Vec<Job> {
        let count=self.get_job_count(owner.clone());
        let start=from_index.unwrap_or(0).min(count);
        let end=start.saturating_add(limit.unwrap_or(20).min(50)).min(count);
        (start..end).filter_map(|i| self.owner_index.get(&format!("{}:{}",owner,i)).and_then(|id|self.jobs.get(&id))).collect()
    }
    pub fn storage_reserve(&self) -> U128 { U128(STORAGE_RESERVE) }
    pub fn version(&self) -> String { "2.0.0-testnet".into() }
}
impl PayoutLatch {
    fn emit(&self, job_id:&str,event:&str){env::log_str(&format!("EVENT_JSON:{}",near_sdk::serde_json::json!({"standard":"payoutlatch","version":"2.0.0","event":event,"data":[{"job_id":job_id}]})));}
    fn start_transfer(&mut self,job_id:String,refund:bool)->Promise{
        require!(env::prepaid_gas()>=Gas::from_tgas(40),"Attach at least 40 Tgas");
        let mut job=self.jobs.get(&job_id).expect("Unknown job");
        require!(job.status==Status::Approved,"Job is pending, paid or cancelled");
        job.status=if refund {Status::RefundPending} else {Status::Pending};
        job.attempt=job.attempt.checked_add(1).expect("Attempt overflow");
        job.updated_at=env::block_timestamp_ms();
        self.jobs.insert(&job_id,&job);
        self.emit(&job_id,if refund {"refund_pending"} else {"pending"});
        let recipient=if refund {job.owner} else {job.recipient};
        Promise::new(recipient).transfer(NearToken::from_yoctonear(job.amount.0)).then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(15)).on_transfer(job_id,job.attempt,refund))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::{VMContextBuilder,get_created_receipts},testing_env};
    const ID:&str="owner.testnet:edit-01";
    fn context(who:&str,deposit:u128){testing_env!(VMContextBuilder::new().current_account_id("latch.testnet".parse().unwrap()).predecessor_account_id(who.parse().unwrap()).signer_account_id(who.parse().unwrap()).attached_deposit(NearToken::from_yoctonear(deposit)).prepaid_gas(Gas::from_tgas(100)).build());}
    fn setup()->PayoutLatch{context("owner.testnet",STORAGE_RESERVE+1000);let mut c=PayoutLatch::new();c.approve_job("edit-01".into(),"Edit".into(),"editor.testnet".parse().unwrap(),U128(1000),Some("agent.testnet".parse().unwrap()));context("agent.testnet",0);c}
    #[test]fn payment_locks_before_callback(){let mut c=setup();drop(c.execute(ID.into()));assert_eq!(c.get_job(ID.into()).unwrap().status,Status::Pending);assert_eq!(get_created_receipts().len(),2);context("latch.testnet",0);assert!(c.on_transfer(ID.into(),1,false,Ok(())));assert_eq!(c.get_job(ID.into()).unwrap().status,Status::Paid);}
    #[test]#[should_panic(expected="Job is pending")]fn concurrent_blocked(){let mut c=setup();drop(c.execute(ID.into()));drop(c.execute(ID.into()));}
    #[test]#[should_panic(expected="Job is pending")]fn replay_blocked(){let mut c=setup();drop(c.execute(ID.into()));c.on_transfer(ID.into(),1,false,Ok(()));drop(c.execute(ID.into()));}
    #[test]fn failure_allows_retry(){let mut c=setup();drop(c.execute(ID.into()));assert!(!c.on_transfer(ID.into(),1,false,Err(PromiseError::Failed)));drop(c.execute(ID.into()));assert_eq!(c.get_job(ID.into()).unwrap().attempt,2);}
    #[test]#[should_panic(expected="Executor not authorized")]fn stranger_blocked(){let mut c=setup();context("stranger.testnet",0);drop(c.execute(ID.into()));}
    #[test]#[should_panic(expected="Executor not authorized")]fn revoked_blocked(){let mut c=setup();context("owner.testnet",0);c.set_executor(ID.into(),None);context("agent.testnet",0);drop(c.execute(ID.into()));}
    #[test]#[should_panic(expected="Owner only")]fn stranger_cannot_cancel(){let mut c=setup();drop(c.cancel(ID.into()));}
    #[test]#[should_panic(expected="Owner only")]fn stranger_cannot_change_executor(){let mut c=setup();c.set_executor(ID.into(),None);}
    #[test]#[should_panic(expected="Job ID already exists")]fn duplicate_blocked(){let mut c=setup();context("owner.testnet",STORAGE_RESERVE+1000);c.approve_job("edit-01".into(),"Other".into(),"editor.testnet".parse().unwrap(),U128(1000),None);}
    #[test]#[should_panic(expected="Stale callback")]fn stale_callback_blocked(){let mut c=setup();drop(c.execute(ID.into()));c.on_transfer(ID.into(),0,false,Ok(()));}
    #[test]fn cancel_returns_to_funding_owner(){let mut c=setup();context("owner.testnet",0);drop(c.cancel(ID.into()));assert_eq!(c.get_job(ID.into()).unwrap().status,Status::RefundPending);c.on_transfer(ID.into(),1,true,Ok(()));assert_eq!(c.get_job(ID.into()).unwrap().status,Status::Cancelled);}
    #[test]fn owner_namespaces_and_pagination(){let mut c=setup();context("second.testnet",STORAGE_RESERVE+1000);let id=c.approve_job("edit-01".into(),"Other".into(),"editor.testnet".parse().unwrap(),U128(1000),None);assert_eq!(id,"second.testnet:edit-01");let jobs=c.get_jobs("owner.testnet".parse().unwrap(),None,None);assert_eq!(jobs.len(),1);assert_eq!(jobs[0].job_id,ID);assert_eq!(c.get_job_count("second.testnet".parse().unwrap()),1);assert!(c.get_jobs("owner.testnet".parse().unwrap(),Some(1),None).is_empty());}
    #[test]#[should_panic(expected="Attach amount")]fn underfunded_rejected(){context("owner.testnet",1000);let mut c=PayoutLatch::new();c.approve_job("a".into(),"a".into(),"editor.testnet".parse().unwrap(),U128(1000),None);}
    #[test]fn reserve_covers_maximum_record(){context("owner.testnet",STORAGE_RESERVE+1000);let mut c=PayoutLatch::new();let before=env::storage_usage();c.approve_job("a".repeat(64),"a".repeat(120),"a".repeat(64).parse().unwrap(),U128(1000),Some("b".repeat(64).parse().unwrap()));assert!(u128::from(env::storage_usage()-before)*env::storage_byte_cost().as_yoctonear()<=STORAGE_RESERVE);}
}

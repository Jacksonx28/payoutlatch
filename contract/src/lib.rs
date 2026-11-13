use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError};
use near_sdk::collections::{LookupMap, UnorderedSet};
use near_sdk::json_types::U128;

// Retained per job to cover persistent storage. Job identifiers are never reused.
const STORAGE_RESERVE: u128 = 20_000_000_000_000_000_000_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum Status { Approved, Pending, Paid, RefundPending, Cancelled }

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Job {
    pub recipient: AccountId,
    pub amount: U128,
    pub status: Status,
    pub attempt: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct PayoutLatch {
    owner: AccountId,
    executors: UnorderedSet<AccountId>,
    jobs: LookupMap<String, Job>,
}

#[near]
impl PayoutLatch {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        require!(env::predecessor_account_id() == owner, "Owner must initialize");
        Self { owner, executors: UnorderedSet::new(b"e"), jobs: LookupMap::new(b"j") }
    }

    pub fn set_executor(&mut self, account: AccountId, enabled: bool) {
        self.assert_owner();
        if enabled {
            require!(self.executors.len() < 20 || self.executors.contains(&account), "Maximum 20 executors");
            self.executors.insert(&account);
        } else { self.executors.remove(&account); }
    }

    #[payable]
    pub fn approve_job(&mut self, job_id: String, recipient: AccountId, amount: U128) {
        self.assert_owner();
        require!(!job_id.is_empty() && job_id.len() <= 96, "Job ID must be 1-96 bytes");
        require!(self.jobs.get(&job_id).is_none(), "Job ID already exists");
        require!(recipient != env::current_account_id(), "Cannot pay this contract");
        require!(amount.0 > 0, "Amount must be positive");
        let deposit = amount.0.checked_add(STORAGE_RESERVE).expect("Amount overflow");
        require!(env::attached_deposit().as_yoctonear() == deposit, "Attach amount plus 0.02 NEAR storage reserve");
        self.jobs.insert(&job_id, &Job { recipient, amount, status: Status::Approved, attempt: 0 });
        self.emit(&job_id, "approved");
    }

    // Callers supply only the approved job ID. They cannot change amount or payee.
    pub fn execute(&mut self, job_id: String) -> Promise {
        let caller = env::predecessor_account_id();
        require!(caller == self.owner || self.executors.contains(&caller), "Executor not authorized");
        self.start_transfer(job_id, false)
    }

    pub fn cancel(&mut self, job_id: String) -> Promise {
        self.assert_owner();
        self.start_transfer(job_id, true)
    }

    #[private]
    pub fn on_transfer(&mut self, job_id: String, attempt: u64, refund: bool,
        #[callback_result] result: Result<(), PromiseError>) -> bool {
        let mut job = self.jobs.get(&job_id).expect("Unknown job");
        let expected = if refund { Status::RefundPending } else { Status::Pending };
        require!(job.status == expected && job.attempt == attempt, "Stale callback");
        let success = result.is_ok();
        job.status = if success {
            if refund { Status::Cancelled } else { Status::Paid }
        } else { Status::Approved };
        self.jobs.insert(&job_id, &job);
        self.emit(&job_id, if success { if refund { "cancelled" } else { "paid" } } else { "transfer_failed" });
        success
    }

    pub fn get_job(&self, job_id: String) -> Option<Job> { self.jobs.get(&job_id) }
    pub fn get_owner(&self) -> AccountId { self.owner.clone() }
    pub fn get_executors(&self) -> Vec<AccountId> { self.executors.to_vec() }
    pub fn storage_reserve(&self) -> U128 { U128(STORAGE_RESERVE) }
}

impl PayoutLatch {
    fn assert_owner(&self) { require!(env::predecessor_account_id() == self.owner, "Owner only"); }
    fn emit(&self, job_id: &str, event: &str) {
        env::log_str(&format!("EVENT_JSON:{}", near_sdk::serde_json::json!({"standard":"payoutlatch","version":"1.0.0","event":event,"data":[{"job_id":job_id}]})));
    }
    fn start_transfer(&mut self, job_id: String, refund: bool) -> Promise {
        require!(env::prepaid_gas() >= Gas::from_tgas(40), "Attach at least 40 Tgas");
        let mut job = self.jobs.get(&job_id).expect("Unknown job");
        require!(job.status == Status::Approved, "Job is pending, paid or cancelled");
        job.status = if refund { Status::RefundPending } else { Status::Pending };
        job.attempt = job.attempt.checked_add(1).expect("Attempt overflow");
        // Persist lock before scheduling any asynchronous payment.
        self.jobs.insert(&job_id, &job);
        self.emit(&job_id, if refund { "refund_pending" } else { "pending" });
        let recipient = if refund { self.owner.clone() } else { job.recipient };
        Promise::new(recipient).transfer(NearToken::from_yoctonear(job.amount.0)).then(
            Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(15))
                .on_transfer(job_id, job.attempt, refund))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::{VMContextBuilder, get_created_receipts}, testing_env};
    fn context(who: &str, deposit: u128) {
        testing_env!(VMContextBuilder::new().current_account_id("latch.testnet".parse().unwrap())
            .predecessor_account_id(who.parse().unwrap()).signer_account_id(who.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit)).prepaid_gas(Gas::from_tgas(100)).build());
    }
    fn setup() -> PayoutLatch {
        context("owner.testnet", 0);
        let mut c = PayoutLatch::new("owner.testnet".parse().unwrap());
        c.set_executor("agent.testnet".parse().unwrap(), true);
        context("owner.testnet", STORAGE_RESERVE + 1000);
        c.approve_job("edit-01".into(), "editor.testnet".parse().unwrap(), U128(1000));
        context("agent.testnet", 0);
        c
    }
    #[test]
    fn payment_locks_before_callback() {
        let mut c = setup(); drop(c.execute("edit-01".into()));
        assert_eq!(c.get_job("edit-01".into()).unwrap().status, Status::Pending);
        assert_eq!(get_created_receipts().len(), 2);
        context("latch.testnet", 0);
        assert!(c.on_transfer("edit-01".into(), 1, false, Ok(())));
        assert_eq!(c.get_job("edit-01".into()).unwrap().status, Status::Paid);
    }
    #[test] #[should_panic(expected="Job is pending")]
    fn concurrent_execution_blocked() { let mut c=setup(); drop(c.execute("edit-01".into())); drop(c.execute("edit-01".into())); }
    #[test] #[should_panic(expected="Job is pending")]
    fn paid_execution_blocked() { let mut c=setup(); drop(c.execute("edit-01".into())); c.on_transfer("edit-01".into(),1,false,Ok(())); drop(c.execute("edit-01".into())); }
    #[test]
    fn confirmed_failure_allows_retry() {
        let mut c=setup(); drop(c.execute("edit-01".into()));
        assert!(!c.on_transfer("edit-01".into(),1,false,Err(PromiseError::Failed)));
        drop(c.execute("edit-01".into()));
        assert_eq!(c.get_job("edit-01".into()).unwrap().attempt,2);
    }
    #[test] #[should_panic(expected="Executor not authorized")]
    fn stranger_blocked() { let mut c=setup(); context("stranger.testnet",0); drop(c.execute("edit-01".into())); }
    #[test] #[should_panic(expected="Executor not authorized")]
    fn revoked_executor_blocked() { let mut c=setup(); context("owner.testnet",0); c.set_executor("agent.testnet".parse().unwrap(),false); context("agent.testnet",0); drop(c.execute("edit-01".into())); }
    #[test] #[should_panic(expected="Owner only")]
    fn agent_cannot_approve() { let mut c=setup(); c.approve_job("other".into(),"agent.testnet".parse().unwrap(),U128(1000)); }
    #[test] #[should_panic(expected="Job ID already exists")]
    fn duplicate_job_blocked() { let mut c=setup(); context("owner.testnet",STORAGE_RESERVE+1000); c.approve_job("edit-01".into(),"editor.testnet".parse().unwrap(),U128(1000)); }
    #[test] #[should_panic(expected="Stale callback")]
    fn stale_callback_blocked() { let mut c=setup(); drop(c.execute("edit-01".into())); c.on_transfer("edit-01".into(),0,false,Ok(())); }
    #[test]
    fn cancellation_refunds_and_closes() { let mut c=setup(); context("owner.testnet",0); drop(c.cancel("edit-01".into())); assert_eq!(c.get_job("edit-01".into()).unwrap().status,Status::RefundPending); c.on_transfer("edit-01".into(),1,true,Ok(())); assert_eq!(c.get_job("edit-01".into()).unwrap().status,Status::Cancelled); }
}

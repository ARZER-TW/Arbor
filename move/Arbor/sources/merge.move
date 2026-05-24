/// Arbor — Merge requests. The proposer first commits the merged artifact to
/// Walrus and provides it here (multi-parent), so approvers review the actual
/// merged result, not a preview of changes. Auto-merge is the special case
/// `approval_threshold == 0`. A `base_tip` snapshot gives cheap stale-merge
/// detection: execution aborts if the target branch moved after the proposal.
module Arbor::merge;

use std::string::String;
use sui::vec_set::{Self, VecSet};
use sui::clock::Clock;
use sui::event;
use Arbor::artifact;
use Arbor::repository::{Self, Repository};

const EWrongRepo: u64 = 0;
const EBranchNotFound: u64 = 1;
const ENotPending: u64 = 2;
const ENotReady: u64 = 3;
const EStaleMerge: u64 = 4;
const ECannotSelfApprove: u64 = 5;

const STATUS_PENDING: u8 = 0;
const STATUS_READY: u8 = 1;
const STATUS_MERGED: u8 = 2;

public struct MergeRequest has key {
    id: UID,
    repo: ID,
    target_branch: String,
    /// Pre-committed, frozen merged artifact node (already on Walrus).
    merged_node: ID,
    /// Target branch tip at propose time; execution aborts if it has moved.
    base_tip: ID,
    proposer: address,
    approvals: VecSet<address>,
    status: u8,
    created_at_ms: u64,
}

public struct MergeProposed has copy, drop {
    mr_id: ID,
    repo: ID,
    target_branch: String,
    merged_node: ID,
    proposer: address,
    threshold: u64,
}

public struct MergeApproved has copy, drop {
    mr_id: ID,
    approver: address,
    approvals: u64,
    status: u8,
}

public struct MergeExecuted has copy, drop {
    mr_id: ID,
    repo: ID,
    target_branch: String,
    node_id: ID,
}

/// Open a merge request: freeze the proposed merged node and share the request.
public fun propose_merge(
    repo: &Repository,
    target_branch: String,
    merged_blob_id: u256,
    parents: vector<ID>,
    kind: String,
    message: String,
    metadata_blob_id: Option<u256>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    repository::assert_writer(repo, ctx.sender());
    assert!(repository::has_branch(repo, target_branch), EBranchNotFound);
    let repo_id = repository::repo_id(repo);
    let base_tip = repository::branch_tip(repo, target_branch);
    let merged_node = artifact::create_frozen(
        repo_id,
        merged_blob_id,
        parents,
        kind,
        message,
        metadata_blob_id,
        clock,
        ctx,
    );
    let threshold = repository::approval_threshold(repo);
    let approvals = vec_set::empty<address>();
    let status = if (vec_set::length(&approvals) >= threshold) STATUS_READY else STATUS_PENDING;
    let mr = MergeRequest {
        id: object::new(ctx),
        repo: repo_id,
        target_branch,
        merged_node,
        base_tip,
        proposer: ctx.sender(),
        approvals,
        status,
        created_at_ms: clock.timestamp_ms(),
    };
    event::emit(MergeProposed {
        mr_id: object::uid_to_inner(&mr.id),
        repo: repo_id,
        target_branch: mr.target_branch,
        merged_node,
        proposer: mr.proposer,
        threshold,
    });
    transfer::share_object(mr);
}

/// Approve a pending merge request. The proposer cannot self-approve.
public fun approve(repo: &Repository, mr: &mut MergeRequest, ctx: &TxContext) {
    assert!(mr.repo == repository::repo_id(repo), EWrongRepo);
    assert!(mr.status == STATUS_PENDING, ENotPending);
    let who = ctx.sender();
    repository::assert_writer(repo, who);
    assert!(who != mr.proposer, ECannotSelfApprove);
    if (!vec_set::contains(&mr.approvals, &who)) {
        vec_set::insert(&mut mr.approvals, who);
    };
    if (vec_set::length(&mr.approvals) >= repository::approval_threshold(repo)) {
        mr.status = STATUS_READY;
    };
    event::emit(MergeApproved {
        mr_id: object::uid_to_inner(&mr.id),
        approver: who,
        approvals: vec_set::length(&mr.approvals),
        status: mr.status,
    });
}

/// Execute a ready merge request: move the target branch tip to the merged node.
public fun execute_merge(repo: &mut Repository, mr: &mut MergeRequest, ctx: &TxContext) {
    assert!(mr.repo == repository::repo_id(repo), EWrongRepo);
    assert!(mr.status == STATUS_READY, ENotReady);
    repository::assert_writer(repo, ctx.sender());
    assert!(repository::branch_tip(repo, mr.target_branch) == mr.base_tip, EStaleMerge);
    repository::set_branch_tip(repo, mr.target_branch, mr.merged_node);
    mr.status = STATUS_MERGED;
    event::emit(MergeExecuted {
        mr_id: object::uid_to_inner(&mr.id),
        repo: mr.repo,
        target_branch: mr.target_branch,
        node_id: mr.merged_node,
    });
}

// === reads ===
public fun merged_node(mr: &MergeRequest): ID { mr.merged_node }
public fun status(mr: &MergeRequest): u8 { mr.status }
public fun approvals_count(mr: &MergeRequest): u64 { vec_set::length(&mr.approvals) }
public fun target_branch(mr: &MergeRequest): String { mr.target_branch }
public fun proposer(mr: &MergeRequest): address { mr.proposer }
public fun repo(mr: &MergeRequest): ID { mr.repo }

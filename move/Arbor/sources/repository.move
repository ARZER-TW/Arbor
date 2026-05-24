/// Arbor — Repository: the workspace object. Holds the branch table
/// (branch name -> tip ArtifactNode id), the root node, and the embedded
/// access / merge policies. Shared so multiple agents can fork, commit, and
/// merge against it.
module Arbor::repository;

use std::string::{Self, String};
use sui::table::{Self, Table};
use sui::clock::Clock;
use sui::event;
use Arbor::artifact;
use Arbor::policy::{Self, AccessPolicy, MergePolicy};

const EBranchNotFound: u64 = 0;
const EBranchExists: u64 = 1;

const MAIN: vector<u8> = b"main";

public struct Repository has key {
    id: UID,
    name: String,
    owner: address,
    /// branch name -> tip ArtifactNode id
    branches: Table<String, ID>,
    root: ID,
    access: AccessPolicy,
    merge: MergePolicy,
}

public struct RepositoryCreated has copy, drop {
    repo_id: ID,
    name: String,
    owner: address,
    root_node: ID,
}

public struct BranchForked has copy, drop {
    repo_id: ID,
    source: String,
    new_branch: String,
    tip: ID,
}

public struct Committed has copy, drop {
    repo_id: ID,
    branch: String,
    node_id: ID,
    parent: ID,
    creator: address,
    blob_id: u256,
}

/// Create a repository with an initial root artifact on branch "main".
public fun create_repository(
    name: String,
    root_blob_id: u256,
    root_kind: String,
    root_message: String,
    public_read: bool,
    writers: vector<address>,
    approval_threshold: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let id = object::new(ctx);
    let repo_id = object::uid_to_inner(&id);
    let owner = ctx.sender();
    let root_node = artifact::create_frozen(
        repo_id,
        root_blob_id,
        vector[],
        root_kind,
        root_message,
        option::none(),
        clock,
        ctx,
    );
    let mut branches = table::new<String, ID>(ctx);
    table::add(&mut branches, string::utf8(MAIN), root_node);
    let repo = Repository {
        id,
        name,
        owner,
        branches,
        root: root_node,
        access: policy::new_access(public_read, writers, owner),
        merge: policy::new_merge(approval_threshold),
    };
    event::emit(RepositoryCreated { repo_id, name: repo.name, owner, root_node });
    transfer::share_object(repo);
}

/// Create `new_branch` pointing at the current tip of `source`.
public fun fork_branch(
    repo: &mut Repository,
    source: String,
    new_branch: String,
    ctx: &TxContext,
) {
    policy::assert_can_write(&repo.access, ctx.sender());
    assert!(table::contains(&repo.branches, source), EBranchNotFound);
    assert!(!table::contains(&repo.branches, new_branch), EBranchExists);
    let tip = *table::borrow(&repo.branches, source);
    table::add(&mut repo.branches, new_branch, tip);
    event::emit(BranchForked {
        repo_id: object::uid_to_inner(&repo.id),
        source,
        new_branch,
        tip,
    });
}

/// Commit a new artifact onto `branch`; its parent is the current tip.
public fun commit(
    repo: &mut Repository,
    branch: String,
    blob_id: u256,
    kind: String,
    message: String,
    metadata_blob_id: Option<u256>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    policy::assert_can_write(&repo.access, ctx.sender());
    assert!(table::contains(&repo.branches, branch), EBranchNotFound);
    let repo_id = object::uid_to_inner(&repo.id);
    let parent = *table::borrow(&repo.branches, branch);
    let node = artifact::create_frozen(
        repo_id,
        blob_id,
        vector[parent],
        kind,
        message,
        metadata_blob_id,
        clock,
        ctx,
    );
    *table::borrow_mut(&mut repo.branches, branch) = node;
    event::emit(Committed {
        repo_id,
        branch,
        node_id: node,
        parent,
        creator: ctx.sender(),
        blob_id,
    });
}

// === reads ===
public fun name(repo: &Repository): String { repo.name }
public fun owner(repo: &Repository): address { repo.owner }
public fun root(repo: &Repository): ID { repo.root }
public fun repo_id(repo: &Repository): ID { object::uid_to_inner(&repo.id) }
public fun has_branch(repo: &Repository, branch: String): bool {
    table::contains(&repo.branches, branch)
}
public fun branch_tip(repo: &Repository, branch: String): ID {
    *table::borrow(&repo.branches, branch)
}
public fun branch_count(repo: &Repository): u64 { table::length(&repo.branches) }

// === package-internal (merge flow) ===
public(package) fun set_branch_tip(repo: &mut Repository, branch: String, node: ID) {
    *table::borrow_mut(&mut repo.branches, branch) = node;
}
public(package) fun assert_writer(repo: &Repository, who: address) {
    policy::assert_can_write(&repo.access, who);
}
public(package) fun approval_threshold(repo: &Repository): u64 {
    policy::threshold(&repo.merge)
}

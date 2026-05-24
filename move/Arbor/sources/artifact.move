/// Arbor — Artifact node: an immutable, content-addressed snapshot of one
/// artifact version. The byte content lives on Walrus; on-chain we only store
/// the Walrus `blob_id` (u256) plus the DAG edges (parents) and provenance.
///
/// Nodes are frozen (immutable) after creation: a version can never be altered,
/// only superseded by a new node. Multi-parent (`parents: vector<ID>`) supports
/// N-way merges.
module Arbor::artifact;

use std::string::String;
use sui::clock::Clock;
use sui::event;

/// One immutable artifact version. Frozen on creation.
public struct ArtifactNode has key {
    id: UID,
    /// Repository this node belongs to.
    repo: ID,
    /// Walrus content identifier. Same content => same blob_id (content-addressed).
    blob_id: u256,
    /// Parent node ids. Empty for the root; one for a commit; many for a merge.
    parents: vector<ID>,
    creator: address,
    created_at_ms: u64,
    /// Free-form type tag: "report" / "code" / "data" / "analysis" / ...
    kind: String,
    /// Commit message.
    message: String,
    /// Optional Walrus blob holding extended metadata (tags, description).
    metadata_blob_id: Option<u256>,
}

public struct ArtifactCreated has copy, drop {
    node_id: ID,
    repo: ID,
    blob_id: u256,
    creator: address,
    parents: vector<ID>,
    kind: String,
}

/// Build a new artifact node and freeze it. Returns the new node id.
/// Package-internal: only repository / merge flows create nodes.
public(package) fun create_frozen(
    repo: ID,
    blob_id: u256,
    parents: vector<ID>,
    kind: String,
    message: String,
    metadata_blob_id: Option<u256>,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let node = ArtifactNode {
        id: object::new(ctx),
        repo,
        blob_id,
        parents,
        creator: ctx.sender(),
        created_at_ms: clock.timestamp_ms(),
        kind,
        message,
        metadata_blob_id,
    };
    let node_id = object::id(&node);
    event::emit(ArtifactCreated {
        node_id,
        repo,
        blob_id,
        creator: node.creator,
        parents: node.parents,
        kind: node.kind,
    });
    transfer::freeze_object(node);
    node_id
}

public fun blob_id(node: &ArtifactNode): u256 { node.blob_id }
public fun parents(node: &ArtifactNode): vector<ID> { node.parents }
public fun creator(node: &ArtifactNode): address { node.creator }
public fun created_at_ms(node: &ArtifactNode): u64 { node.created_at_ms }
public fun kind(node: &ArtifactNode): String { node.kind }
public fun message(node: &ArtifactNode): String { node.message }
public fun repo(node: &ArtifactNode): ID { node.repo }
public fun metadata_blob_id(node: &ArtifactNode): Option<u256> { node.metadata_blob_id }

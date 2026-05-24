/// Arbor — Repository policies. Both are embedded `store` structs inside a
/// `Repository` (not standalone objects): combinability comes from two
/// independent fields, and embedding keeps commit / merge transactions from
/// having to carry extra policy objects. Cross-repo shared policies are a
/// future extension.
module Arbor::policy;

use sui::vec_set::{Self, VecSet};

const ENotWriter: u64 = 0;

/// Who may read / write the repository.
public struct AccessPolicy has store {
    /// Reserved for Seal-gated private repos (stretch). Not enforced for the
    /// public-repo MVP, where all artifacts are stored in the clear on Walrus.
    public_read: bool,
    writers: VecSet<address>,
}

/// How merges are authorized. `approval_threshold == 0` means auto-merge;
/// `>= 1` requires that many distinct approvals before a merge can execute.
public struct MergePolicy has store {
    approval_threshold: u64,
}

public(package) fun new_access(
    public_read: bool,
    writers: vector<address>,
    owner: address,
): AccessPolicy {
    let mut set = vec_set::empty<address>();
    vec_set::insert(&mut set, owner);
    let mut i = 0;
    let n = vector::length(&writers);
    while (i < n) {
        let w = *vector::borrow(&writers, i);
        if (!vec_set::contains(&set, &w)) {
            vec_set::insert(&mut set, w);
        };
        i = i + 1;
    };
    AccessPolicy { public_read, writers: set }
}

public(package) fun new_merge(approval_threshold: u64): MergePolicy {
    MergePolicy { approval_threshold }
}

public(package) fun assert_can_write(access: &AccessPolicy, who: address) {
    assert!(vec_set::contains(&access.writers, &who), ENotWriter);
}

public(package) fun threshold(merge: &MergePolicy): u64 { merge.approval_threshold }

public fun is_writer(access: &AccessPolicy, who: address): bool {
    vec_set::contains(&access.writers, &who)
}

public fun public_read(access: &AccessPolicy): bool { access.public_read }

public fun writers(access: &AccessPolicy): &vector<address> { vec_set::keys(&access.writers) }

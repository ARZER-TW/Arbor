#[test_only]
module Arbor::arbor_tests;

use std::string;
use sui::clock;
use sui::test_scenario as ts;
use Arbor::repository::{Self, Repository};
use Arbor::merge::{Self, MergeRequest};

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;

// Full spine: create -> commit -> fork -> commit -> propose -> approve -> execute.
#[test]
fun test_fork_commit_merge_flow() {
    let mut sc = ts::begin(ALICE);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));

    // ALICE creates a repo; writers = {ALICE, BOB}; 1 approval required.
    repository::create_repository(
        string::utf8(b"defi-research"),
        1u256,
        string::utf8(b"report"),
        string::utf8(b"root"),
        true,
        vector[ALICE, BOB],
        1,
        &clk,
        ts::ctx(&mut sc),
    );

    // ALICE commits to main, then forks `analyst` from main.
    ts::next_tx(&mut sc, ALICE);
    {
        let mut repo = ts::take_shared<Repository>(&sc);
        repository::commit(
            &mut repo,
            string::utf8(b"main"),
            2u256,
            string::utf8(b"report"),
            string::utf8(b"hunter scan"),
            option::none(),
            &clk,
            ts::ctx(&mut sc),
        );
        let main_tip = repository::branch_tip(&repo, string::utf8(b"main"));
        repository::fork_branch(&mut repo, string::utf8(b"main"), string::utf8(b"analyst"), ts::ctx(&mut sc));
        assert!(repository::branch_tip(&repo, string::utf8(b"analyst")) == main_tip, 0);
        assert!(repository::branch_count(&repo) == 2, 1);
        ts::return_shared(repo);
    };

    // BOB commits to analyst, then proposes merging analyst -> main.
    ts::next_tx(&mut sc, BOB);
    {
        let mut repo = ts::take_shared<Repository>(&sc);
        repository::commit(
            &mut repo,
            string::utf8(b"analyst"),
            3u256,
            string::utf8(b"analysis"),
            string::utf8(b"deep dive"),
            option::none(),
            &clk,
            ts::ctx(&mut sc),
        );
        let main_tip = repository::branch_tip(&repo, string::utf8(b"main"));
        let analyst_tip = repository::branch_tip(&repo, string::utf8(b"analyst"));
        merge::propose_merge(
            &repo,
            string::utf8(b"main"),
            4u256,
            vector[main_tip, analyst_tip],
            string::utf8(b"report"),
            string::utf8(b"merge analyst into main"),
            option::none(),
            &clk,
            ts::ctx(&mut sc),
        );
        ts::return_shared(repo);
    };

    // ALICE (not the proposer) approves -> request becomes READY.
    ts::next_tx(&mut sc, ALICE);
    {
        let repo = ts::take_shared<Repository>(&sc);
        let mut mr = ts::take_shared<MergeRequest>(&sc);
        merge::approve(&repo, &mut mr, ts::ctx(&mut sc));
        assert!(merge::status(&mr) == 1, 2); // STATUS_READY
        assert!(merge::approvals_count(&mr) == 1, 3);
        ts::return_shared(mr);
        ts::return_shared(repo);
    };

    // ALICE executes; main tip becomes the merged node.
    ts::next_tx(&mut sc, ALICE);
    {
        let mut repo = ts::take_shared<Repository>(&sc);
        let mut mr = ts::take_shared<MergeRequest>(&sc);
        let merged = merge::merged_node(&mr);
        merge::execute_merge(&mut repo, &mut mr, ts::ctx(&mut sc));
        assert!(repository::branch_tip(&repo, string::utf8(b"main")) == merged, 4);
        assert!(merge::status(&mr) == 2, 5); // STATUS_MERGED
        ts::return_shared(mr);
        ts::return_shared(repo);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// Proposer must not be able to self-approve (separation of duties).
#[test]
#[expected_failure(abort_code = Arbor::merge::ECannotSelfApprove)]
fun test_proposer_cannot_self_approve() {
    let mut sc = ts::begin(ALICE);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));

    repository::create_repository(
        string::utf8(b"r"),
        1u256,
        string::utf8(b"report"),
        string::utf8(b"root"),
        true,
        vector[ALICE],
        1,
        &clk,
        ts::ctx(&mut sc),
    );

    ts::next_tx(&mut sc, ALICE);
    {
        let repo = ts::take_shared<Repository>(&sc);
        let main_tip = repository::branch_tip(&repo, string::utf8(b"main"));
        merge::propose_merge(
            &repo,
            string::utf8(b"main"),
            2u256,
            vector[main_tip],
            string::utf8(b"report"),
            string::utf8(b"x"),
            option::none(),
            &clk,
            ts::ctx(&mut sc),
        );
        ts::return_shared(repo);
    };

    ts::next_tx(&mut sc, ALICE);
    {
        let repo = ts::take_shared<Repository>(&sc);
        let mut mr = ts::take_shared<MergeRequest>(&sc);
        merge::approve(&repo, &mut mr, ts::ctx(&mut sc)); // aborts: self-approve
        ts::return_shared(mr);
        ts::return_shared(repo);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

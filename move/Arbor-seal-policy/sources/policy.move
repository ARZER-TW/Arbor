/// Arbor Seal policy — access control for Seal IBE keys.
///
/// 本檔是基本 whitelist 模式。可改成 timestamp / subscription / vault-based 等。
/// 規則：
/// - 函數名以 seal_approve 開頭
/// - 第一參數固定 `id: vector<u8>`（IBE identity，**不含** package id）
/// - 拒絕用 `assert!(..., ENoAccess)`，不 return
/// - 必須 side-effect free
/// - 為 upgrade flexibility，宣告 entry fun
module Arbor_seal_policy::policy;

use sui::table::{Self, Table};

const ENoAccess: u64 = 0;

public struct AccessList has key {
    id: UID,
    addresses: Table<address, bool>,
}

public fun new(ctx: &mut TxContext) {
    transfer::share_object(AccessList {
        id: object::new(ctx),
        addresses: table::new(ctx),
    });
}

public fun add(list: &mut AccessList, who: address) {
    if (!table::contains(&list.addresses, who)) {
        table::add(&mut list.addresses, who, true);
    };
}

entry fun seal_approve(_id: vector<u8>, list: &AccessList, ctx: &TxContext) {
    assert!(table::contains(&list.addresses, ctx.sender()), ENoAccess);
}

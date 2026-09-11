// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GuardBase} from "./GuardBase.t.sol";

/// @dev Allowlist set/isAllowed + EC-001-4 (re-cased address treated identically).
contract GuardAllowlistTest is GuardBase {
    function test_setAllowlist_flipsIsAllowed() public {
        assertFalse(guard.isAllowed(ensNode, recipient), "default not allowed");

        vm.prank(admin);
        guard.setAllowlist(ensNode, recipient, true);
        assertTrue(guard.isAllowed(ensNode, recipient), "allowed after set");

        vm.prank(admin);
        guard.setAllowlist(ensNode, recipient, false);
        assertFalse(guard.isAllowed(ensNode, recipient), "removable");
    }

    /// EC-001-4: the same address value in different checksum casing is the same 20-byte key.
    /// A string-based allowlist would treat re-cased text differently; the address-keyed
    /// mapping cannot be bypassed by re-casing at the app layer.
    function test_isAllowed_reCasedAddressIdentical() public {
        // "0xCafEcaFE..." checksummed and "0xcafecafe..." lowercase parse to the SAME 20-byte
        // value. Build both from identical bytes to model the app layer passing either casing.
        uint160 raw = uint160(0xCAFECAFE);
        address fromChecksummed = address(raw);
        address fromLowercased = address(raw);

        vm.prank(admin);
        guard.setAllowlist(ensNode, fromChecksummed, true);

        // Querying with the "differently cased" (but value-identical) address returns true.
        assertTrue(guard.isAllowed(ensNode, fromLowercased), "same value allowlisted regardless of casing");
        assertEq(fromChecksummed, fromLowercased, "addresses are value-equal irrespective of source casing");
    }
}

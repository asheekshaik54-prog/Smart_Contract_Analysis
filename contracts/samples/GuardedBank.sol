// SPDX-License-Identifier: MIT
// Test fixture: same ordering as VulnerableBank but protected by a reentrancy lock.
// Expected to show the REENT-001 false-positive class documented in docs/limitations.md.
pragma solidity ^0.8.20;
contract GuardedBank {
    mapping(address => uint256) public balances;
    uint256 private locked = 1;
    modifier nonReentrant() { require(locked == 1, "locked"); locked = 2; _; locked = 1; }
    function deposit() external payable { balances[msg.sender] += msg.value; }
    function withdraw() external nonReentrant {
        uint256 amt = balances[msg.sender];
        require(amt > 0, "no balance");
        (bool ok, ) = msg.sender.call{value: amt}("");
        require(ok, "send failed");
        balances[msg.sender] = 0;
    }
}

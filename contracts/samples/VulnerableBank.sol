// SPDX-License-Identifier: MIT
// Test fixture ONLY. Intentionally vulnerable. Never deploy.
pragma solidity ^0.8.20;
contract VulnerableBank {
    mapping(address => uint256) public balances;
    function deposit() external payable { balances[msg.sender] += msg.value; }
    function withdraw() external {
        uint256 amt = balances[msg.sender];
        require(amt > 0, "no balance");
        (bool ok, ) = msg.sender.call{value: amt}("");
        require(ok, "send failed");
        balances[msg.sender] = 0;   // state update AFTER external call
    }
}

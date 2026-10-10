// SPDX-License-Identifier: MIT
// Test fixture: checks-effects-interactions ordering.
pragma solidity ^0.8.20;
contract SafeBank {
    mapping(address => uint256) public balances;
    function deposit() external payable { balances[msg.sender] += msg.value; }
    function withdraw() external {
        uint256 amt = balances[msg.sender];
        require(amt > 0, "no balance");
        balances[msg.sender] = 0;   // effects before interaction
        (bool ok, ) = msg.sender.call{value: amt}("");
        require(ok, "send failed");
    }
}

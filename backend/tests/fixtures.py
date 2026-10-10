from asm import asm

# balance read, CALL with that value, then zero the balance AFTER the call
VULNERABLE = asm("""
PUSH1 0; SLOAD; DUP1; ISZERO; PUSH2 @fail; JUMPI
PUSH1 0; PUSH1 0; PUSH1 0; PUSH1 0; DUP5; CALLER; GAS; CALL; POP; POP
PUSH1 0; PUSH1 0; SSTORE; STOP
fail: JUMPDEST; PUSH1 0; PUSH1 0; REVERT
""")
# same, but balance zeroed BEFORE the call (checks-effects-interactions)
SAFE = asm("""
PUSH1 0; SLOAD; DUP1; ISZERO; PUSH2 @fail; JUMPI
PUSH1 0; PUSH1 0; SSTORE
PUSH1 0; PUSH1 0; PUSH1 0; PUSH1 0; DUP5; CALLER; GAS; CALL; POP; POP; STOP
fail: JUMPDEST; PUSH1 0; PUSH1 0; REVERT
""")
# external call, no storage writes at all
CALL_ONLY = asm("PUSH1 0; PUSH1 0; PUSH1 0; PUSH1 0; PUSH1 0; CALLER; GAS; CALL; POP; STOP")
# CALL with constant zero value, then SSTORE
ZERO_VALUE = asm("PUSH1 0; PUSH1 0; PUSH1 0; PUSH1 0; PUSH1 0; CALLER; GAS; CALL; POP; PUSH1 1; PUSH1 1; SSTORE; STOP")
# constant slot 5 read before call, written after
SAME_SLOT = asm("""
PUSH1 5; SLOAD; POP
PUSH1 0; PUSH1 0; PUSH1 0; PUSH1 0; CALLVALUE; CALLER; GAS; CALL; POP
PUSH1 1; PUSH1 5; SSTORE; STOP
""")
# SSTORE only reachable via an unresolved dynamic jump -> must be reported as a limitation, not a finding
DYNAMIC = asm("""
PUSH1 0; PUSH1 0; PUSH1 0; PUSH1 0; PUSH1 0; CALLER; GAS; CALL; POP
PUSH1 0; CALLDATALOAD; JUMP
t: JUMPDEST; PUSH1 1; PUSH1 1; SSTORE; STOP
""")
# unreachable CALL after STOP, with SSTORE
UNREACHABLE = asm("STOP; PUSH1 0; PUSH1 0; PUSH1 0; PUSH1 0; CALLVALUE; CALLER; GAS; CALL; POP; PUSH1 1; PUSH1 1; SSTORE; STOP")
# slot read before call is calldata-dependent (not constant): evidence is moderate, severity medium
DIFF_SLOT = asm("""
PUSH1 0; CALLDATALOAD; SLOAD; POP
PUSH1 0; PUSH1 0; PUSH1 0; PUSH1 0; CALLVALUE; CALLER; GAS; CALL; POP
PUSH1 1; PUSH1 5; SSTORE; STOP
""")

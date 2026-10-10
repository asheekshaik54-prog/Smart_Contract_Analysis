# Known limitations (v0.1.0)

- Only one rule (REENT-001). No claim is made about any other vulnerability class. No findings != secure.
- **False negatives**: SLOAD/SSTORE/CALL behind unresolved dynamic jumps are invisible to the static rule. Observed on
  real solc -O0 output: the vulnerable contract is only reported as low/inconclusive (solver still reaches the path).
- **False positives**: reentrancy locks are not recognised. Observed: `GuardedBank` (nonReentrant) is flagged high.
- Cross-function / cross-contract / read-only reentrancy are not modelled. CALLCODE/DELEGATECALL/STATICCALL are listed
  but not analysed by the rule.
- Symbolic execution is incomplete on real contracts because RETURNDATACOPY (and others) are unmodelled; callee
  behaviour is not modelled at all, so symbolic results never demonstrate a re-entrant attack.
- Compiler metadata tails are decoded as instructions (appear as unknown/truncated).
- Proxy detection, RPC retrieval, source mapping: not implemented.
- Differential analysis is byte- and instruction-level only (no block/semantic comparison).

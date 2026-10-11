export interface Instruction { offset: number; opcode: number; mnemonic: string; size: number; immediate: string; status: string }
export interface Evidence { id: string; kind: string; description: string; offsets: number[]; data: Record<string, unknown> }
export type Severity = 'informational' | 'low' | 'medium' | 'high'
export type Classification = 'evidence_backed_potential' | 'heuristic_warning' | 'inconclusive'
export interface Finding {
  id: string; rule_id: string; rule_version: string; title: string; description: string
  severity: Severity; classification: Classification; evidence_strength: string; exploitability: string
  offsets: number[]; evidence_ids: string[]; preconditions: string[]; remediation: string[]
  verification_steps: string[]; false_positive_considerations: string[]; limitations: string[]
  potential_impact: string; solver_status: string; path_conditions: string[]; witness: Record<string, unknown>
}
export interface CfgBlock { start: number; end: number; unresolved_jump: boolean; invalid_jump_target: number | null }
export interface CfgEdge { src: number; dst: number; kind: 'fallthrough' | 'jump' | 'jumpi_true' | 'jumpi_false' }
export interface Coverage {
  decoding: { bytes: number; instructions: number; valid: number; unknown_opcodes: number; unavailable_in_revision: number; truncated_push: number; unsupported_offsets: number[]; note: string }
  structure: { basic_blocks: number; edges: number; blocks_reachable_from_entry_via_resolved_edges: number; instructions_reachable_via_resolved_edges: number; unresolved_dynamic_jumps: number[]; invalid_constant_jump_targets: { jump: number; target: number }[]; note: string }
  security_analysis: { rules_executed: string[]; external_call_sites: { offset: number; mnemonic: string }[]; unanalysed_call_kinds: string[]; symbolic_execution: string; note: string }
}
export interface SymbolicPath { call_offset: number; sstore_offset: number; status: string; path_conditions: string[]; path_condition_count: number; witness: Record<string, unknown> }
export interface SymbolicResult {
  status: 'complete_within_model' | 'incomplete' | 'cancelled'; config: Record<string, number>; steps: number; paths_started: number
  terminations: Record<string, number>; unsupported_opcodes: Record<string, number>
  call_then_sstore_paths: SymbolicPath[]; call_value_feasibility: Record<string, string>; assumptions: string[]
}
export interface AnalysisResult {
  scan_id: string; created_at: string; analyzer_version: string; rule_set_version: string
  status: 'completed' | 'completed_with_limitations' | 'cancelled'; limitation_reasons: string[]
  bytecode: { sha256: string; size_bytes: number; evm_revision: string }
  configuration: Record<string, unknown>
  fingerprint: { input_fingerprint_sha256: string; result_fingerprint_sha256: string; reproducibility_note: string }
  rules: Record<string, { version: string; title: string; description: string; opcodes: string[]; preconditions: string[]; false_positives: string[]; limitations: string[] }>
  findings: Finding[]; evidence: Evidence[]; coverage: Coverage; symbolic_execution: SymbolicResult | null
  instructions: Instruction[]; cfg: { blocks: CfgBlock[]; edges: CfgEdge[] }; limitations: string[]
}
export interface RuleGroup { rule_id: string; classification: string; severity: string; count?: number }
export interface CompareResult {
  identical: boolean
  byte_level: { original_size: number; updated_size: number; size_delta: number; differing_bytes_in_common_prefix_length: number; first_differing_offset: number | null }
  instruction_level: { changes: { op: string; original: { offset: number; mnemonic: string; immediate: string }[]; updated: { offset: number; mnemonic: string; immediate: string }[] }[]; change_count: number; truncated: boolean }
  call_and_storage_op_counts: Record<string, { original: number; updated: number }>
  findings: { added_rule_groups: RuleGroup[]; removed_rule_groups: RuleGroup[]; unchanged_rule_groups: RuleGroup[] }
  limitations: string[]; original: { sha256: string; status: string }; updated: { sha256: string; status: string }
}
export interface Capabilities { analyzer_version: string; evm_revisions: string[]; default_revision: string; rules: string[]; symbolic_execution: string; persistence: boolean; rpc_retrieval: boolean }
export interface Limits { max_paths: number; max_steps: number; max_depth: number; max_jumpdest_visits: number; solver_timeout_ms: number; max_seconds: number }

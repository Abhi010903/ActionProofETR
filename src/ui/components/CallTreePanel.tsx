import React from 'react';
import type { CallTreeNode, DecodeEvidence } from '../../evidence/types.js';
import { GitBranchIcon, ShieldAlertIcon, CheckCircleIcon, TerminalIcon } from '../icons.js';

interface CallTreePanelProps {
  decodeEvidence?: DecodeEvidence;
  targetContract?: string;
  isReady: boolean;
}

export const CallTreePanel: React.FC<CallTreePanelProps> = ({
  decodeEvidence,
  targetContract,
  isReady,
}) => {
  const isMulticall = decodeEvidence?.status === 'MULTICALL_DECODED';
  const isUnknown = decodeEvidence?.status === 'UNKNOWN_CALLDATA';
  const hasUnlimited = decodeEvidence?.hasExactUnlimitedApproval;
  const hasHighVal = decodeEvidence?.hasHighValueApproval;

  const renderNodes = (nodes: CallTreeNode[], isRoot = true) => {
    return (
      <div className="tree-branch-container">
        {nodes.map((node, idx) => {
          const isLast = idx === nodes.length - 1;
          const isDanger = node.isDangerous;

          return (
            <div key={idx} className={`tree-node-wrapper ${isDanger ? 'node-danger' : 'node-safe'}`}>
              <div className="tree-node-line">
                <span className="branch-symbol mono">
                  {isRoot ? (isLast ? '└── ' : '├── ') : (isLast ? '    └── ' : '    ├── ')}
                </span>
                <div className={`tree-node-content ${isDanger ? 'content-danger' : 'content-safe'}`}>
                  <div className="node-title-row">
                    <span className="node-func mono">
                      {node.depth > 0 ? `Subcall #${idx + 1}: ` : 'Root Call: '}
                      <strong>{node.functionName}()</strong>
                    </span>
                    {isDanger ? (
                      <span className="node-badge badge-threat">
                        <ShieldAlertIcon size={12} color="#f87171" />
                        <span>⚠ DANGEROUS</span>
                      </span>
                    ) : (
                      <span className="node-badge badge-expected">
                        <CheckCircleIcon size={12} color="#34d399" />
                        <span>✓ EXPECTED</span>
                      </span>
                    )}
                  </div>

                  <div className="node-meta-grid">
                    <div className="meta-item">
                      <span className="m-label">Target:</span>
                      <span className="m-val mono text-cyan" title={node.target}>
                        {node.target}
                      </span>
                    </div>
                    {node.signature && (
                      <div className="meta-item">
                        <span className="m-label">Selector:</span>
                        <span className="m-val mono">{node.signature}</span>
                      </div>
                    )}
                  </div>

                  {node.dangerReason && (
                    <div className="node-danger-alert">
                      <ShieldAlertIcon size={13} color="#fca5a5" />
                      <span>{node.dangerReason}</span>
                    </div>
                  )}

                  {node.args && Object.keys(node.args).length > 0 && (
                    <div className="node-args-box mono">
                      <span className="args-label">Decoded Parameters:</span>
                      <pre className="args-pre">
                        {JSON.stringify(node.args, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}
                      </pre>
                    </div>
                  )}

                  {node.children && node.children.length > 0 && (
                    <div className="nested-children">
                      {renderNodes(node.children, false)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="soc-panel soc-calltree-panel" id="section-calltree">
      <div className="panel-header">
        <div className="panel-header-left">
          <span className="panel-tag tag-cyan">DEEP BYTECODE RECON</span>
          <h2 className="panel-title">Decoded Call Tree & Multicall Inspection</h2>
        </div>
        <div className="panel-header-right">
          <div className="calltree-status-badge">
            <GitBranchIcon size={13} color="#38bdf8" />
            <span>
              {isReady
                ? 'STANDBY'
                : decodeEvidence?.status ?? 'DECODING PENDING'}
            </span>
          </div>
        </div>
      </div>

      {isReady && (
        <div className="calltree-empty-state">
          <TerminalIcon size={24} color="#64748b" />
          <p>Call tree will be independently decompiled upon gate execution.</p>
          <span className="text-muted text-small">
            Target contract: {targetContract ?? 'Staged in memory'}
          </span>
        </div>
      )}

      {!isReady && decodeEvidence && (
        <div className="calltree-body">
          {/* Critical Warnings */}
          {hasUnlimited && (
            <div className="threat-callout threat-critical">
              <ShieldAlertIcon size={16} color="#ef4444" />
              <div>
                <strong>CRITICAL SECURITY VIOLATION:</strong> Stealth unlimited token approval (<code>type(uint256).max</code>) detected in nested payload!
              </div>
            </div>
          )}

          {hasHighVal && !hasUnlimited && (
            <div className="threat-callout threat-warning">
              <ShieldAlertIcon size={16} color="#f59e0b" />
              <div>
                <strong>HIGH-VALUE APPROVAL DETECTED:</strong> Approval amount &ge; 10^30 tokens detected for external spender!
              </div>
            </div>
          )}

          {isUnknown && (
            <div className="threat-callout threat-critical">
              <ShieldAlertIcon size={16} color="#ef4444" />
              <div>
                <strong>FAIL-CLOSED CALLDATA ENFORCEMENT:</strong> Unrecognized function selector. ActionProof cannot independently decode the call semantics; refusing to verify unmodeled bytecode.
              </div>
            </div>
          )}

          {/* Root Call Tree Header */}
          <div className="calltree-root-header">
            <span className="root-symbol mono">
              {isMulticall ? 'MULTICALL CONTAINER (BATCH)' : 'SINGLE CALL DISPATCH'}
            </span>
            <span className="root-status text-cyan mono">
              STATUS: {decodeEvidence.status}
            </span>
          </div>

          {/* Tree Structure */}
          {decodeEvidence.callTree && decodeEvidence.callTree.length > 0 ? (
            renderNodes(decodeEvidence.callTree, true)
          ) : (
            <div className="calltree-single-fallback mono">
              <div className="single-call-row">
                <span className="text-muted">Target:</span> {targetContract}
              </div>
              <div className="single-call-row">
                <span className="text-muted">Function:</span> {decodeEvidence.functionName ?? 'Unknown / Raw'}
              </div>
              {decodeEvidence.args && (
                <div className="single-args">
                  <pre>{JSON.stringify(decodeEvidence.args, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

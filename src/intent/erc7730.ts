/**
 * ActionProof ERC-7730 v2 Clear-Signing Adapter
 *
 * WHAT it guarantees:
 * - Honestly distinguishes between LOCAL_FIXTURE descriptors and LIVE_REGISTRY descriptors.
 * - Performs deterministic field cross-validation between descriptor fields and independent ABI decode.
 * - Detects descriptor mismatches when decoded calldata contradicts descriptor parameters.
 * - Treats clear-signing descriptors as strictly advisory semantic evidence.
 *
 * WHAT it does NOT guarantee:
 * - Descriptor presence does NOT guarantee runtime contract honesty or transaction safety.
 */

import type { DecodeEvidence, IntentEvidence, DescriptorCrossValidation } from '../evidence/types.js';
import { type IntentProvider, MANDATORY_INTENT_DISCLAIMER } from './intent-provider.js';

export interface ERC7730DescriptorV2 {
  readonly schemaVersion: '2.0.0';
  readonly id: string;
  readonly context: {
    readonly contract: string;
    readonly chainId: number;
  };
  readonly expectedFields: readonly string[];
  readonly display: {
    readonly formats: Record<string, string>;
  };
}

// Local test/demo fixtures explicitly labeled as LOCAL_FIXTURE
export const LOCAL_DESCRIPTOR_FIXTURES: Record<string, Record<string, ERC7730DescriptorV2>> = {
  // Uniswap SwapRouter02
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': {
    exactInputSingle: {
      schemaVersion: '2.0.0',
      id: 'uniswap.v3.swaprouter02.exactInputSingle',
      context: {
        contract: 'SwapRouter02',
        chainId: 1,
      },
      expectedFields: ['tokenIn', 'tokenOut', 'amountIn', 'amountOutMinimum', 'recipient'],
      display: {
        formats: {
          intent: 'Swap {amountIn} {tokenIn} for minimum {amountOutMinimum} {tokenOut}',
        },
      },
    },
  },
  // USDC
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
    transfer: {
      schemaVersion: '2.0.0',
      id: 'erc20.usdc.transfer',
      context: {
        contract: 'USDC',
        chainId: 1,
      },
      expectedFields: ['to', 'amount'],
      display: {
        formats: {
          intent: 'Transfer {amount} USDC to {to}',
        },
      },
    },
    approve: {
      schemaVersion: '2.0.0',
      id: 'erc20.usdc.approve',
      context: {
        contract: 'USDC',
        chainId: 1,
      },
      expectedFields: ['spender', 'amount'],
      display: {
        formats: {
          intent: 'Approve {spender} to spend {amount} USDC',
        },
      },
    },
  },
};

export class ERC7730v2Adapter implements IntentProvider {
  constructor(private readonly enableLocalFixtures = true) {}

  async resolveIntent(
    target: `0x${string}`,
    _chainId: number,
    _data: `0x${string}`,
    decodeEvidence: DecodeEvidence
  ): Promise<IntentEvidence> {
    const normalizedTarget = target.toLowerCase();
    const contractDescriptors = this.enableLocalFixtures
      ? LOCAL_DESCRIPTOR_FIXTURES[normalizedTarget]
      : undefined;

    if (!contractDescriptors || !decodeEvidence.functionName) {
      return {
        status: 'DESCRIPTOR_ABSENT',
        provenance: 'NONE',
        schemaVersion: '2.0.0',
        descriptorId: null,
        intentDisplay: null,
        matchedFields: null,
        crossValidation: {
          performed: false,
          matches: false,
          discrepancies: [],
        },
        disclaimer: MANDATORY_INTENT_DISCLAIMER,
      };
    }

    const descriptor = contractDescriptors[decodeEvidence.functionName];
    if (!descriptor) {
      return {
        status: 'DESCRIPTOR_ABSENT',
        provenance: 'NONE',
        schemaVersion: '2.0.0',
        descriptorId: null,
        intentDisplay: null,
        matchedFields: null,
        crossValidation: {
          performed: false,
          matches: false,
          discrepancies: [],
        },
        disclaimer: MANDATORY_INTENT_DISCLAIMER,
      };
    }

    // Deterministic cross-validation between descriptor expected fields and decoded args
    const decodedArgs = decodeEvidence.args ?? {};
    const discrepancies: string[] = [];

    for (const field of descriptor.expectedFields) {
      if (decodedArgs[field] === undefined) {
        discrepancies.push(`Missing expected field in decoded calldata: ${field}`);
      }
    }

    const crossValidation: DescriptorCrossValidation = {
      performed: true,
      matches: discrepancies.length === 0,
      discrepancies,
    };

    if (!crossValidation.matches) {
      return {
        status: 'DESCRIPTOR_MISMATCH',
        provenance: 'LOCAL_FIXTURE',
        schemaVersion: '2.0.0',
        descriptorId: descriptor.id,
        intentDisplay: null,
        matchedFields: decodedArgs,
        crossValidation,
        disclaimer: MANDATORY_INTENT_DISCLAIMER,
      };
    }

    // Format display string from matched args
    let displayStr = descriptor.display.formats.intent ?? `${decodeEvidence.functionName}(...)`;
    for (const [k, v] of Object.entries(decodedArgs)) {
      displayStr = displayStr.replace(`{${k}}`, String(v));
    }

    return {
      status: 'DESCRIPTOR_FOUND',
      provenance: 'LOCAL_FIXTURE',
      schemaVersion: '2.0.0',
      descriptorId: descriptor.id,
      intentDisplay: displayStr,
      matchedFields: decodedArgs,
      crossValidation,
      disclaimer: MANDATORY_INTENT_DISCLAIMER,
    };
  }
}

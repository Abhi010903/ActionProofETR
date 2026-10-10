import { createPublicLiveEvidencePipeline } from '../src/evidence/pipeline.js';
import { computeCommitment } from '../src/canonical/commitment.js';
import { encodeFunctionData } from 'viem';

async function testSwapEndToEnd() {
  const abi = [{
    inputs: [{
      components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'recipient', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'amountOutMinimum', type: 'uint256' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' }
      ],
      name: 'params',
      type: 'tuple'
    }],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  }] as const;

  const SENDER = '0x04f8996da763b7a969b1028ee3007569eaf3a635' as const;
  const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45' as const;
  const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;
  const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' as const;

  const calldata = encodeFunctionData({
    abi,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn: USDC,
      tokenOut: WETH,
      fee: 3000,
      recipient: SENDER,
      amountIn: 100000000n,
      amountOutMinimum: 50000000000000000n,
      sqrtPriceLimitX96: 0n
    }]
  });

  const rawTx = {
    from: SENDER,
    to: ROUTER,
    value: '0x0',
    data: calldata,
    chainId: 1
  };

  const commitment = computeCommitment(rawTx);
  const pipeline = createPublicLiveEvidencePipeline();
  const evidence = await pipeline.runPipeline(
    commitment.canonical,
    commitment,
    'Swap 100 USDC -> ETH',
    'DAPP_UI'
  );

  console.log('Swap Live Verdict:', evidence.policy.verdict);
  console.log('Contract:', {
    status: evidence.contract.status,
    provenance: evidence.contract.provenance,
    name: evidence.contract.contractName
  });
  console.log('Intent:', {
    status: evidence.intent.status,
    provenance: evidence.intent.provenance,
    display: evidence.intent.intentDisplay
  });
  console.log('Sim:', {
    status: evidence.simulation.status,
    provenance: evidence.simulation.provenance,
    blockNumber: evidence.simulation.blockNumber
  });
}

testSwapEndToEnd().catch(console.error);

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Load the actual TS modules in Node without adding a test-runner dependency.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  } }).outputText, filename);
};

const { analyzeContract } = require('../lib/providers/explorer.ts');
const { normalizeArcTools } = require('../lib/providers/arctools.ts');
const { deriveSecurity } = require('../lib/security.ts');
const { classify } = require('../lib/score.ts');
const { POST } = require('../app/api/x402-check/route.ts');
const { collectOfficial } = require('../lib/providers/official.ts');
const { privateKeyToAccount } = require('viem/accounts');

test('verified source without ABI leaves capabilities unknown', () => {
  const result = analyzeContract({ is_verified: true, source_code: 'contract Token {}' });
  assert.equal(result.sourceAvailable, true);
  assert.equal(result.abiAvailable, false);
  assert.equal(result.mintHint, null);
  assert.equal(result.adminSetterHint, null);
});

test('generic request success is not a sell simulation verdict', () => {
  const result = normalizeArcTools({ success: true, status: 'ok' }, 'https://example.com');
  assert.equal(result.sellSimulation, 'UNKNOWN');
  assert.equal(result.honeypot, null);
  assert.equal(normalizeArcTools({ canSell: false }, '').honeypot, null);
  assert.equal(normalizeArcTools({ canSell: true }, '').sellSimulation, 'PASSED');
  assert.equal(normalizeArcTools({ honeypot: true }, '').honeypot, true);
});

test('reported zero or nonzero taxes do not establish effective taxes', () => {
  for (const tax of [0, 2]) {
    const result = deriveSecurity({}, {}, {}, { observations: [
      { protocolId: 'argus', matched: true, data: { buyTaxPct: tax, sellTaxPct: tax } },
    ] });
    assert.equal(result.taxRisk, 'UNKNOWN');
  }
});

test('admin function names alone do not prove a critical executable power', () => {
  const result = deriveSecurity({}, { owner: '0x0000000000000000000000000000000000000001' },
    { contractAnalysis: { blacklistHint: true, mintHint: true, privilegedFunctionNames: ['blacklist', 'mint'] } });
  assert.equal(result.blacklistCapabilityHint, true);
  assert.equal(result.criticalAdminRisk, null);
});

test('two platform payers do not establish independent external usage', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => Response.json({ distinctPayers: 2, x402CallsPaid: 100 });
  try {
    const { data } = await collectOfficial('0xe66d5169c5d235209d74e976e594060c44c64420');
    assert.equal(data.usageEvidence.distinctPayers, 2);
    assert.notEqual(data.usageEvidence.independenceVerified, true);
    assert.notEqual(data.externalUsageWallets, 2);
  } finally { global.fetch = originalFetch; }
});

test('unavailable bytecode is missing evidence, not no-contract evidence', () => {
  const scan = { onchain: { codeExists: null }, official: { productState: 'UNKNOWN' },
    security: { sellObserved: null, taxRisk: 'UNKNOWN' }, market: {},
    acceleration: { signal: 'NO_BASELINE' } };
  const result = classify(scan);
  assert.equal(result.blockers.includes('address has no contract bytecode on Arc mainnet'), false);
  assert.ok(result.missing.includes('contract bytecode check unavailable'));
  scan.onchain.codeExists = false;
  assert.ok(classify(scan).blockers.includes('address has no contract bytecode on Arc mainnet'));
});

test('EIP-3009 simulation verifies signature and only makes read-only RPC calls', async () => {
  // Public disposable test key, never a user wallet.
  const account = privateKeyToAccount('0x' + '01'.repeat(32));
  const asset = '0x3600000000000000000000000000000000000000';
  const authorization = { from: account.address, to: '0x0000000000000000000000000000000000000002',
    value: '1000', validAfter: '0', validBefore: String(Math.floor(Date.now()/1000) + 60), nonce: '0x'+'11'.repeat(32) };
  const signature = await account.signTypedData({
    domain: { name: 'USDC', version: '2', chainId: 5042, verifyingContract: asset },
    types: { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] }, primaryType: 'TransferWithAuthorization',
    message: { ...authorization, value: 1000n, validAfter: 0n, validBefore: BigInt(authorization.validBefore) },
  });
  const originalFetch = global.fetch;
  const methods = [];
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    methods.push(request.method);
    assert.ok(['eth_chainId', 'eth_call'].includes(request.method));
    return Response.json({ jsonrpc: '2.0', id: request.id,
      result: request.method === 'eth_chainId' ? '0x13b2' : '0x' });
  };
  const invoke = async (overrides = {}) => POST(new Request('https://example.com/api/x402-check', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'simulate-eip3009', asset, authorization, signature, ...overrides }),
  }));
  try {
    const response = await invoke();
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.result, 'SIMULATION_OK');
    assert.equal(body.paymentSent, false);
    assert.equal(body.signatureRecoveredLocally, true);
    assert.deepEqual(methods, ['eth_chainId', 'eth_call']);
    methods.length = 0;
    assert.equal((await invoke({ asset: '0x0000000000000000000000000000000000000001' })).status, 400);
    assert.equal((await invoke({ authorization: { ...authorization, value: '10001' } })).status, 400);
    assert.equal((await invoke({ authorization: { ...authorization, from: authorization.to } })).status, 400);
    assert.deepEqual(methods, []);
  } finally { global.fetch = originalFetch; }
});

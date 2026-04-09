import { describe, it, expect } from 'vitest';
import { SealTenderClient } from '../src/SealTenderClient';

describe('SealTenderClient', () => {
  it('should be a class with required methods', () => {
    const methods = Object.getOwnPropertyNames(SealTenderClient.prototype);

    // Verify critical public methods exist
    expect(methods).toContain('createTender');
    expect(methods).toContain('submitBid');
    expect(methods).toContain('encryptBid'); // now public
    expect(methods).toContain('withRetry');  // now public
    expect(methods).toContain('getContract'); // now public
    expect(methods).toContain('listenToEvents');
    expect(methods).toContain('stopListening');
  });

  it('should have all tender lifecycle methods', () => {
    const methods = Object.getOwnPropertyNames(SealTenderClient.prototype);
    expect(methods).toContain('createTender');
    expect(methods).toContain('getTenderCount');
    expect(methods).toContain('getTenderAddress');
    expect(methods).toContain('getTenderConfig');
    expect(methods).toContain('cancelTender');
  });

  it('should have all escrow methods', () => {
    const methods = Object.getOwnPropertyNames(SealTenderClient.prototype);
    expect(methods).toContain('deposit');
    expect(methods).toContain('release');
    expect(methods).toContain('refund');
    expect(methods).toContain('freeze');
    expect(methods).toContain('slash');
  });

  it('should have all dispute methods', () => {
    const methods = Object.getOwnPropertyNames(SealTenderClient.prototype);
    expect(methods).toContain('fileCompanyComplaint');
    expect(methods).toContain('fileCitizenComplaint');
    expect(methods).toContain('resolveDispute');
    expect(methods).toContain('getDispute');
  });

  it('should have all escalation methods', () => {
    const methods = Object.getOwnPropertyNames(SealTenderClient.prototype);
    expect(methods).toContain('setEscalationRule');
    expect(methods).toContain('evaluateEscalation');
    expect(methods).toContain('updateOraclePrice');
  });

  it('should have FHE encryption helper', () => {
    const methods = Object.getOwnPropertyNames(SealTenderClient.prototype);
    expect(methods).toContain('encryptBid'); // public after fix
    expect(methods).toContain('initFhevm');
  });
});

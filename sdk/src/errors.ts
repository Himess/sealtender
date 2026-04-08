export class SealTenderError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SealTenderError';
  }
}

export class FHEEncryptionError extends SealTenderError {
  constructor(message: string) {
    super(message, 'FHE_ENCRYPTION_FAILED');
    this.name = 'FHEEncryptionError';
  }
}

export class ContractCallError extends SealTenderError {
  constructor(message: string, public readonly contractName: string, public readonly functionName: string) {
    super(`${contractName}.${functionName}: ${message}`, 'CONTRACT_CALL_FAILED');
    this.name = 'ContractCallError';
  }
}

export class TransactionError extends SealTenderError {
  constructor(message: string, public readonly txHash?: string) {
    super(message, 'TRANSACTION_FAILED');
    this.name = 'TransactionError';
  }
}

export class ValidationError extends SealTenderError {
  constructor(message: string, public readonly field: string) {
    super(message, 'VALIDATION_FAILED');
    this.name = 'ValidationError';
  }
}

export class WalletNotConnectedError extends SealTenderError {
  constructor() {
    super('Wallet not connected. Please connect your wallet first.', 'WALLET_NOT_CONNECTED');
    this.name = 'WalletNotConnectedError';
  }
}

import { Transaction } from '@multiversx/sdk-core';
import { getAccountProvider } from '@multiversx/sdk-dapp/out/providers/helpers/accountProvider';
import { TransactionManager } from '@multiversx/sdk-dapp/out/managers/TransactionManager';

type TransactionsDisplayInfoType = {
  processingMessage?: string;
  errorMessage?: string;
  successMessage?: string;
};

type SignAndSendTransactionsProps = {
  transactions: Transaction[];
  transactionsDisplayInfo?: TransactionsDisplayInfoType;
};

export const signAndSendTransactions = async ({
  transactions,
  transactionsDisplayInfo
}: SignAndSendTransactionsProps) => {
  try {
    const provider = getAccountProvider();
    const txManager = TransactionManager.getInstance();

    const signedTransactions = await provider.signTransactions(transactions);
    const sentTransactions = await txManager.send(signedTransactions);
    const sessionId = await txManager.track(sentTransactions, {
      transactionsDisplayInfo
    });

    return sessionId;
  } catch (error) {
    console.error('Error in signAndSendTransactions:', error);
    throw error;
  }
};

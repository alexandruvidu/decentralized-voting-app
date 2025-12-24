// Minimal module declarations to satisfy TypeScript for MultiversX SDK Dapp
// This project relies on runtime exports from @multiversx/sdk-dapp, but the package
// does not ship comprehensive type exports for the referenced paths. These ambient
// declarations unblock TS while keeping usage flexible.
declare module '@multiversx/sdk-dapp/hooks' {
  export const useGetAccountInfo: any;
  export const useGetLoginInfo: any;
}

declare module '@multiversx/sdk-dapp/services' {
  export const sendTransactions: any;
}

declare module '@multiversx/sdk-dapp/utils' {
  export const logout: any;
}

declare module '@multiversx/sdk-dapp/UI' {
  export const ExtensionLoginButton: any;
  export const WebWalletLoginButton: any;
  export const WalletConnectLoginButton: any;
}

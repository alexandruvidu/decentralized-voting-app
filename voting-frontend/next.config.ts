import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@multiversx/sdk-core'],
  
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Polyfills for browser builds
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    
    // Handle WebAssembly
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    
    return config;
  },
};

export default nextConfig;

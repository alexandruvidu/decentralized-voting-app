import type { NextConfig } from 'next';
import webpack from 'webpack';

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
    // Add buffer polyfill
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      buffer: require.resolve('buffer/')
    };

    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer']
      })
    );
    
    // Handle WebAssembly
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/dkg-api/:path*',
        destination: 'http://localhost:3003/:path*',
      },
      {
        source: '/crypto-api/:path*',
        destination: 'http://localhost:3005/:path*',
      },
    ];
  },
};

export default nextConfig;

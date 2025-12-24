#!/bin/bash

# Check if wallet.pem exists
if [ ! -f "wallet.pem" ]; then
    echo "Error: wallet.pem not found in the current directory."
    echo "Please place your wallet.pem file here to deploy."
    echo "You can generate one using 'mxpy wallet new --format pem --outfile wallet.pem' (be careful with secrets!)"
    exit 1
fi

echo "Deploying Voting App Contract to Devnet..."

mxpy contract deploy --bytecode voting-app/output/voting-app.wasm \
    --pem wallet.pem \
    --gas-limit 60000000 \
    --proxy https://devnet-gateway.multiversx.com \
    --chain D \
    --send \
    --outfile deploy-testnet.interaction.json

echo "Deployment complete. Check deploy-testnet.interaction.json for the contract address."
echo "Update voting-frontend/config.ts with the new address."

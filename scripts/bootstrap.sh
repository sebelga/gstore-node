#!/bin/bash

echo "--------------------------------"
echo "Installing root dependencies..."
yarn install

# Install gstore-node dependencies
echo "--------------------------------"
echo "Installing gstore-node dependencies"
cd $(pwd)/packages/gstore-node
yarn install
yarn link

# Install gstore-datastore-adapter dependencies
echo "--------------------------------"
echo "Installing gstore-datstore-adapter dependencies"
cd ../gstore-datastore-adapter
yarn install
yarn link gstore-node

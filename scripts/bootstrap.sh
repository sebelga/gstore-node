#!/bin/bash

yarn install

# Install gstore-node dependencies
cd $(pwd)/packages/gstore-node
yarn install

# Install gstore-datastore-adapter dependencies
cd ../gstore-datastore-adapter
yarn install

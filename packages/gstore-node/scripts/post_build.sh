#!/bin/bash

rm lib/package.json
rm lib/package.d.ts
mv $(pwd)/lib/packages/gstore-node/src/* $(pwd)/lib
rm -rf lib/packages

#!/bin/bash

rm lib/package.json
mv $(pwd)/lib/src/* $(pwd)/lib
rm -rf lib/src

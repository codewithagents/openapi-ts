#!/usr/bin/env bash
# Run all four generators against petstore.yaml
# In a real project these would be npm/pnpm scripts

set -e

PKGS=../packages

node "$PKGS/openapi-zod-ts/dist/cli.cjs"       2>&1 | grep -E "✓|Done"
node "$PKGS/openapi-server/dist/cli.cjs"        2>&1 | grep -E "✓|Done"
node "$PKGS/openapi-react-query/dist/cli.js"    2>&1 | grep -E "✓|Done"
node "$PKGS/openapi-msw/dist/cli.cjs"           2>&1 | grep -E "✓|Done"

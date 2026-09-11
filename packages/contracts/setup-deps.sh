#!/bin/bash
# Fetch the ENSv2 contracts-v2 dependency (gitignored; ~166MB).
# Run once after cloning, before `forge build`/`forge test`.
set -e
cd "$(dirname "$0")"
if [ -f lib/contracts-v2/contracts/src/registry/PermissionedRegistry.sol ]; then
  echo "contracts-v2 already present."
  exit 0
fi
echo "Cloning ensdomains/contracts-v2 into lib/contracts-v2 ..."
git clone --depth 1 --recurse-submodules https://github.com/ensdomains/contracts-v2 lib/contracts-v2
rm -rf lib/contracts-v2/.git
echo "Done. Now run: forge test"

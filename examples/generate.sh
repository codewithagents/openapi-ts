#!/usr/bin/env bash
# Regenerates the committed showcase specs (those with output tracked in git).
# The full 128-spec compatibility matrix is covered by `pnpm test` in each package.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Temp dir for generated-rq config files — both use absolute paths so dirname is irrelevant
GEN_TMP="$(mktemp -d)"
trap 'rm -rf "$GEN_TMP"' EXIT

for config in "$SCRIPT_DIR/configs/"*.json; do
  name=$(basename "$config" .json)
  output_dir="examples/generated/$name"
  # Only regenerate specs whose output directory is committed to git
  if git -C "$REPO_ROOT" ls-files --error-unmatch "$output_dir" > /dev/null 2>&1; then
    echo "Generating $name..."
    node "$REPO_ROOT/packages/openapi-zod-ts/dist/cli.cjs" --config "$config"

    # Regenerate generated-rq/<name>: client (openapi-zod-ts) + hooks (openapi-react-query).
    # The hooks import from ./client.js, so both must land in the same directory.
    rq_output="$SCRIPT_DIR/generated-rq/$name"
    echo "Generating generated-rq/$name..."

    # Detect the spec file (json or yaml) from examples/specs/
    spec_file=""
    for ext in json yaml yml; do
      if [ -f "$SCRIPT_DIR/specs/$name.$ext" ]; then
        spec_file="$SCRIPT_DIR/specs/$name.$ext"
        break
      fi
    done
    if [ -z "$spec_file" ]; then
      echo "ERROR: no spec file found for $name in examples/specs/" >&2
      exit 1
    fi

    # Both CLIs are configured via temp files that use absolute paths so the
    # config file's dirname (used as cwd for path resolution) does not matter.

    # Step 1: generate client files into generated-rq/<name>.
    # No input_schema: generate-rq is a fresh output with no user-owned schema file.
    gen_config="$GEN_TMP/$name.gen.json"
    printf '{\n  "input_openapi": "%s",\n  "output": "%s"\n}\n' \
      "$spec_file" "$rq_output" > "$gen_config"
    node "$REPO_ROOT/packages/openapi-zod-ts/dist/cli.cjs" --config "$gen_config"

    # Step 2: generate hooks + test-utils into generated-rq/<name>.
    rq_config="$GEN_TMP/$name.rq.json"
    printf '{\n  "input_openapi": "%s",\n  "output": "%s"\n}\n' \
      "$spec_file" "$rq_output" > "$rq_config"
    node "$REPO_ROOT/packages/openapi-react-query/dist/cli.js" --config "$rq_config"
  fi
done
echo "Done."

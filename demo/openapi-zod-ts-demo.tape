# ============================================================================
# openapi-zod-ts FULL PIPELINE demo
# ============================================================================
#
# WHAT IT SHOWS:
#   spec -> 4 generators -> TypeScript types, native fetch client,
#   Zod schemas, React Query hooks, MSW handlers, and a server interface.
#   One spec drives the whole stack.
#
# FIXTURE:
#   demo/petstore.yaml - a 3-path OpenAPI 3.1 Pet API
#   demo/openapi-zod-ts.config.json    -> generated/
#   demo/openapi-server.config.json    -> generated/
#   demo/openapi-react-query.config.json -> generated/
#   demo/openapi-msw.config.json       -> generated/
#
#   RUN FROM the repository root:
#     vhs demo/openapi-zod-ts-demo.tape
#
# COMMANDS USED (from demo/ directory):
#   node ../packages/openapi-zod-ts/dist/cli.cjs
#   node ../packages/openapi-server/dist/cli.cjs
#   node ../packages/openapi-react-query/dist/cli.js
#   node ../packages/openapi-msw/dist/cli.cjs
# ============================================================================

Output "docs/public/media/openapi-zod-ts-demo.gif"

Require bat

Set Shell "bash"
Set FontSize 28
Set Width 1180
Set Height 760
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 30ms
Set Framerate 24

Hide
Type "export PS1='$ '"
Enter
Type "cd demo"
Enter
Type "rm -rf generated && mkdir generated"
Enter
Sleep 300ms
Type "clear"
Enter
Sleep 200ms
Show

# --- Beat 1: the spec --------------------------------------------------------
Sleep 500ms
Type "# 1. A Pet API spec with typed schemas"
Enter
Sleep 300ms
Type "bat -p -r 63:90 petstore.yaml"
Enter
Sleep 4000ms

Hide
Type "clear"
Enter
Show

# --- Beat 2: one command per generator ---------------------------------------
Sleep 400ms
Type "# 2. Four generators, one spec"
Enter
Sleep 300ms
Type "node ../packages/openapi-zod-ts/dist/cli.cjs"
Enter
Sleep 800ms
Type "node ../packages/openapi-server/dist/cli.cjs"
Enter
Sleep 800ms
Type "node ../packages/openapi-react-query/dist/cli.js"
Enter
Sleep 800ms
Type "node ../packages/openapi-msw/dist/cli.cjs"
Enter
Sleep 2500ms

Hide
Type "clear"
Enter
Show

# --- Beat 3: generated TypeScript types + fetch client -----------------------
Sleep 400ms
Type "# 3. TypeScript types, inferred from the spec"
Enter
Sleep 300ms
Type "bat -p generated/models.ts"
Enter
Sleep 3200ms

Hide
Type "clear"
Enter
Show

# --- Beat 4: server interface + React Query hooks ----------------------------
Sleep 400ms
Type "# 4. Server interface and React Query hooks"
Enter
Sleep 300ms
Type "bat -p generated/service.ts"
Enter
Sleep 3200ms
Type "bat -p -r 72:88 generated/hooks.ts"
Enter
Sleep 3000ms

Hide
Type "clear"
Enter
Show

# --- Beat 5: MSW mock handlers + end card ------------------------------------
Sleep 400ms
Type "# 5. MSW mock handlers, seeded from the spec"
Enter
Sleep 300ms
Type "bat -p -r 7:37 generated/handlers.ts"
Enter
Sleep 3500ms
Type "# One spec. Types, client, server interface, hooks, mocks."
Enter
Sleep 2500ms

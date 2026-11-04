. "$PSScriptRoot/emulator-env.ps1"
node node_modules/tsx/dist/cli.mjs tools/seed.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node node_modules/@playwright/test/cli.js test
exit $LASTEXITCODE

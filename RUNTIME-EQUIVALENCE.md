# Runtime-equivalence record

The maintenance source on `main` uses project-local npm 11.19.0 instead of
11.6.2. This is a computer-side build-tool update; it does not change the
television-controller implementation.

Before accepting the update, clean copies using both npm versions were tested
and built with the same Homey CLI. Both complete regression suites and both
Homey builds passed. Each generated `.homeybuild` tree contained 177 files.
All application code, assets and installed runtime dependencies were
byte-for-byte identical. Only `package.json` and `package-lock.json` differed,
recording the development-tool version. Both production-only dependency audits
reported zero known vulnerabilities and neither build added a runtime module.

The existing Store app and Homey installation were not changed or newly tested.
The result is therefore classified as offline verified and runtime-equivalent
to Store version 1.0.43, not newly live-proven.

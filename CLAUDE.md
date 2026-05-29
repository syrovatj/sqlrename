# sqlrename — VS Code Extension

## What this extension does

On a data platform, source databases have Polish/abbreviated table and column names (e.g. `SAMOCHODY`, `NUMER_VIN`). Target databases have English, descriptive names (e.g. `NCARS_UCARS_CAR`, `VIN`). Both databases share the same structure, but differ in naming.

**User workflow:**
1. Open a `.sql` file in VS Code.
2. Select the SQL code (or use entire file if nothing selected).
3. Press `Cmd+R` (macOS) / `Ctrl+R` (Windows/Linux).
4. The extension rewrites table and column names using a CSV mapping and displays the result.

## Architecture

- [extension.js](extension.js) — VS Code extension entry point (currently a scaffold with `helloWorld` command). Needs to be wired to the rename command and keybinding.
- [rename_engine/rewrite_sql_schemaless.py](rename_engine/rewrite_sql_schemaless.py) — Python rename engine using `sqlglot` to parse and rewrite SQL ASTs. Handles multi-statement SQL, table aliases, missing mappings.
- [rename_engine/name_conversion.csv](rename_engine/name_conversion.csv) — Semicolon-delimited CSV mapping source→target schema/table/column names. Columns: `source_schema;source_table;source_column;target_schema;target_table;target_column`.

## CSV mapping format

```
source_schema;source_table;source_column;target_schema;target_table;target_column
NCARS_UCARS;SAMOCHODY;NUMER_VIN;INT_TCE_SALES;NCARS_UCARS_CAR;VIN
```

- Delimiter: semicolon (`;`)
- Empty `target_column` means the column is unmapped (logged as warning)
- `TARGET_SCHEMA` in the Python script is currently hardcoded to `INT_TCE_SALES`

## What still needs to be implemented

The extension is a scaffold. The main work is wiring up the VS Code command to the rename engine:

1. Register a command `sqlrename.renameSelection` in [extension.js](extension.js) and [package.json](package.json).
2. Add a keybinding `Cmd+R` / `Ctrl+R` in `package.json` (contributes → keybindings).
3. Get selected text (or full document) from the active editor.
4. Call the Python rename engine — either by spawning `rewrite_sql_schemaless.py` as a subprocess, or by reimplementing the logic in JS/Node.js.
5. Display the rewritten SQL — options include: replacing the selection in-place, opening a new editor tab with the result, or showing a diff view.
6. Report any missing table/column mappings to the user (e.g. via VS Code output channel or information message).

The CSV mapping path should be configurable (VS Code setting), defaulting to the bundled [rename_engine/name_conversion.csv](rename_engine/name_conversion.csv).

## Key decisions to make

- **Python subprocess vs. JS reimplementation**: The Python engine uses `sqlglot` for proper SQL AST parsing. The JS path would need a JS SQL parser (e.g. `node-sql-parser`) or a simpler regex/token approach. Subprocess is more robust but requires Python + sqlglot to be installed on the user's machine.
- **Output style**: Replace selection in-place, open a side-by-side diff, or open a new untitled document.

## Tech stack

- Node.js / VS Code Extension API (`vscode` module)
- Python 3 + `sqlglot` (rename engine)
- SQL dialect: Oracle (configurable in the Python script)

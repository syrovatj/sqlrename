# SQL Rename

Rename table and column names in your SQL queries based on a CSV mapping file. Useful when working across databases with different naming conventions (e.g. Bronze/Silver tables in a lakehouse architecture).

## Installation & Source

1. Install Python 3 on your machine.
2. Install the `sqlglot` library:
   ```bash
   pip install sqlglot
   ```
3. Open VS Code Settings (extension icon → ⚙️ Settings) and configure:
   - **SQL Rename: DB Dialect** — SQL dialect of your database (e.g. `oracle`, `postgres`)
   - **SQL Rename: Mapping CSV Path** — path to your mapping file (leave empty for bundled)
   - **SQL Rename: Target Schema** — target schema name (leave empty for default)

Source code: [GitHub Repository](https://github.com/syrovatj/sqlrename)

## Usage

1. Open a file with the sql code in VS Code.
2. Select the SQL code to rename (or leave empty to rename the entire file).
3. Press **`Cmd+R`** (macOS) / **`Ctrl+R`** (Windows/Linux).
4. The extension replaces names inline and logs any unmapped tables/columns as warnings in the Output.

## CSV Mapping Format

Semicolon-delimited:

```csv
source_table;source_column;target_table;target_column
SAMOCHODY;NUMER_VIN;CAR;VIN
```

- Empty `target_table` or `target_column` means that field is unmapped (logged as a warning).
- Source schema is not required — set the target schema in extension settings.

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `sqlrename.pythonPath` | `python3` | Path to your Python executable |
| `sqlrename.mappingCsvPath` | _(empty)_ | Absolute or workspace-relative path to the CSV mapping file |
| `sqlrename.dbDialect` | `oracle` | SQL dialect for parsing (e.g. `oracle`, `mysql`, `postgres`) |
| `sqlrename.targetSchema` | _(empty)_ | Target schema name; defaults to `dbo` when empty |

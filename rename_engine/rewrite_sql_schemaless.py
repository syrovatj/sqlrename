import csv
import sys
from pathlib import Path
from collections import defaultdict

import sqlglot
from sqlglot import exp


TARGET_SCHEMA = "INT_TCE_SALES"   # change if needed


# -----------------------------
# Load mappings from CSV
# -----------------------------
def load_mappings(csv_path):
    table_map = {}
    column_map = {}

    # Collect the target tables that each source table maps to
    _table_targets = defaultdict(set)

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            src_table = row["source_table"].strip().lower()
            src_column = (row["source_column"] or "").strip().lower() or None
            tgt_table = row["target_table"]
            tgt_column = row["target_column"] or None

            # Store column‑level mapping if a source column is present
            if src_column is not None:
                column_map[(src_table, src_column)] = tgt_column

            # Keep track of the target tables per source table
            _table_targets[src_table].add(tgt_table)

    # Infer table‑level mapping from column‑level rows
    for src_table, tgt_tables in _table_targets.items():
        if len(tgt_tables) == 1:
            # All column rows for this source table point to the same
            # target table – add the mapping
            table_map[src_table] = tgt_tables.pop()
        else:
            # Inconsistent target tables – raise an error or log a warning
            # Here we simply raise an exception; adjust as needed.
            raise ValueError(
                f"Inconsistent target tables for source table "
                f"'{src_table}': {sorted(tgt_tables)}"
            )

    return table_map, column_map


# -----------------------------
# Rewrite SQL
# -----------------------------

def rewrite_sql(sql_text, table_map, column_map, dialect="oracle"):

    missing_tables = set()
    missing_columns = set()

    # Parse ALL statements
    asts = sqlglot.parse(sql_text, read=dialect)

    rewritten_statements = []

    for ast in asts:

        # -----------------------------
        # Build alias -> source table map
        # -----------------------------
        alias_to_table = {}

        for table in ast.find_all(exp.Table):
            real_table = table.name.lower()
            alias = table.alias_or_name.lower() if table.alias_or_name else None

            if alias:
                alias_to_table[alias] = real_table
            else:
                alias_to_table[real_table] = real_table

        # -----------------------------
        # Rewrite columns using aliases
        # -----------------------------
        for col in ast.find_all(exp.Column):
            col_name = col.name.lower()
            table_alias = col.table.lower()

            if not table_alias:
                continue

            if table_alias not in alias_to_table:
                missing_columns.add(("<unknown_alias>", col_name))
                continue

            source_table = alias_to_table[table_alias]
            key = (source_table, col_name)

            if key in column_map:
                col.set("this", exp.Identifier(this=column_map[key]))
            else:
                missing_columns.add(key)

        # -----------------------------
        # Rewrite tables
        # -----------------------------
        for table in ast.find_all(exp.Table):
            name = table.name.lower()

            if name in table_map:
                table.set("db", TARGET_SCHEMA)
                table.set("this", exp.Identifier(this=table_map[name]))
            else:
                missing_tables.add(name)

        rewritten_statements.append(ast.sql(pretty=True))

    # Join all statements back together
    final_sql = ";\n\n".join(rewritten_statements)

    return final_sql, missing_tables, missing_columns


# -----------------------------
# Main
# -----------------------------
def main():
    if len(sys.argv) != 4:
        print("Usage: python rewrite_sql.py <mapping.csv> <input.sql> <output.sql>")
        sys.exit(1)

    script_dir = Path(__file__).resolve().parent
    
    mapping_csv_name = Path(sys.argv[1])
    input_sql_name = Path(sys.argv[2])
    output_sql_name = Path(sys.argv[3])

    mapping_csv = script_dir / mapping_csv_name
    input_sql = script_dir / input_sql_name
    output_sql = script_dir / output_sql_name
    

    table_map, column_map = load_mappings(mapping_csv)

    sql_text = input_sql.read_text(encoding="utf-8")

    rewritten_sql, missing_tables, missing_columns = rewrite_sql(
        sql_text, table_map, column_map
    )

    output_sql.write_text(rewritten_sql, encoding="utf-8")

    print("✔ SQL rewritten successfully")

    if missing_tables:
        print("\n⚠ Missing table mappings:")
        for table in sorted(missing_tables):
            print(f"  - {table}")

    if missing_columns:
        print("\n⚠ Missing column mappings:")
        for table, column in sorted(missing_columns):
            print(f"  - {table.upper()}.{column.upper()}")


if __name__ == "__main__":
    main()

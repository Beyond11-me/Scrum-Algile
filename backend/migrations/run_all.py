"""Run every migration in dependency order.

This script is executed automatically by the Docker entrypoint before the
application server starts.  Each migration is idempotent so running it
repeatedly (on every container restart) is safe.

Usage (from the backend directory)::

    python -m migrations.run_all
"""

import sys
import traceback


def run_all() -> None:
    """Execute all migrations in the correct order."""

    migrations: list[tuple[str, object]] = []

    # --- 1. RBAC tables and role_id column --------------------------------
    try:
        from migrations.rbac_v1 import migrate as rbac_v1_migrate
        migrations.append(("rbac_v1", rbac_v1_migrate))
    except ImportError:
        pass

    # --- 2. UI schema (archived_at on problems) ---------------------------
    try:
        from migrations.ui_schema_v1 import migrate as ui_schema_v1_migrate
        migrations.append(("ui_schema_v1", ui_schema_v1_migrate))
    except ImportError:
        pass

    # --- 3. Problem archive (also adds archived_at, safe if already done) -
    try:
        from migrations.problem_archive_v1 import migrate as archive_v1_migrate
        migrations.append(("problem_archive_v1", archive_v1_migrate))
    except ImportError:
        pass

    # --- 4. Account management v1 (profile_updated_at) --------------------
    try:
        from migrations.account_management_v1 import migrate as acct_v1_migrate
        migrations.append(("account_management_v1", acct_v1_migrate))
    except ImportError:
        pass

    # --- 5. Account management v2 (password_record + backfill) ------------
    try:
        from migrations.account_management_v2 import add_column as acct_v2_add_column
        migrations.append(("account_management_v2.add_column", acct_v2_add_column))
    except ImportError:
        pass

    from migrations.first_login_prompt_v1 import migrate as first_login_prompt_migrate
    migrations.append(("first_login_prompt_v1", first_login_prompt_migrate))

    succeeded = 0
    failed = 0
    for name, func in migrations:
        try:
            result = func()
            print(f"  [OK] {name} -> {result}")
            succeeded += 1
        except Exception:
            failed += 1
            print(f"  [FAIL] {name}")
            traceback.print_exc()

    print(f"Migrations complete: {succeeded} succeeded, {failed} failed.")
    if failed:
        print("WARNING: Some migrations failed. The application will start anyway,")
        print("but affected features may not work correctly.")


if __name__ == "__main__":
    run_all()


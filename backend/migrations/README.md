# Database migrations

The original project creates new tables with `Base.metadata.create_all()`. That
does not add columns to a database that already exists, so schema changes must
be run explicitly before deploying code that depends on them.

## RBAC v1

From `backend/`, run:

```powershell
python -m migrations.rbac_v1
```

The migration creates `roles`, `permissions`, and `role_permissions`, adds
`users.role_id`, seeds `student`, `instructor`, and `admin`, then maps each
existing legacy `users.role` value to its new role. It is safe to run again.

The old `users.role` column intentionally remains during the compatibility
period. Backend response models continue to expose `role` to the frontend.

## Account management v1

Run `python -m migrations.account_management_v1` from `backend/` before using
profile changes. It adds nullable `users.profile_updated_at` and sets every
`Pending` account to `Inactive`. The `users.department` column is left in place
and is no longer shown.

## Account management v2

Run `python -m migrations.account_management_v2` from `backend/` before the
admin user list can show passwords. It adds nullable `users.password_record`,
then fills it for older accounts. An account still using `password123` or `123`
keeps that password. Every other older account gets a new generated password,
and the script prints those emails. The admin edit screen shows the new value.

## Problem archive v1

Run `python -m migrations.problem_archive_v1` from `backend/` before deploying
archive support. It adds nullable `problems.archived_at` without changing
submissions. Legacy rows without `creator_id` remain unassigned and are excluded
from instructors' private question banks until an administrator resolves them.

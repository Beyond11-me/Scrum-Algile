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

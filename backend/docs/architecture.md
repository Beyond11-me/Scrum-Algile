# Backend structure

```text
app/
  core/           # environment configuration and cryptographic primitives
  db/             # SQLAlchemy engine, session and Base
  dependencies/   # reusable FastAPI dependencies
  routers/        # HTTP controllers and endpoint contracts
  services/       # reusable business and authorization logic
  models.py       # SQLAlchemy entities (kept flat for source compatibility)
  schemas.py      # Pydantic request/response contracts (kept flat for source compatibility)
migrations/       # explicit, idempotent database upgrades
scripts/          # local setup, seed and verification commands
tests/            # automated checks
```

`app.database`, `app.security`, and `app.routers.auth.get_current_user` remain
valid compatibility imports. New code should prefer `app.db.session`,
`app.core.security`, and `app.dependencies.auth`.

## RBAC boundary

The application currently has one primary role per user. `users.role_id` points
to `roles`; `role_permissions` grants permissions. Route code should use
`require_roles(...)` or `require_permission(...)` from
`app.services.authorization`, while resource ownership checks remain in the
relevant service/router.

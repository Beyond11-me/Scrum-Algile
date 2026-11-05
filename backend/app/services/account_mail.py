"""Send initial account credentials through the configured SMTP server."""

import os
import smtplib
from email.message import EmailMessage
from email.utils import formataddr


def smtp_configured() -> bool:
    return bool(_setting("SMTP_HOST", "Email__SmtpHost") and _setting("SMTP_FROM", "Email__FromAddress"))


def _setting(primary: str, alternate: str) -> str:
    return (os.getenv(primary) or os.getenv(alternate) or "").strip()


def send_initial_password(email: str, password: str) -> None:
    host = _setting("SMTP_HOST", "Email__SmtpHost")
    sender = _setting("SMTP_FROM", "Email__FromAddress")
    if not host or not sender:
        raise RuntimeError("SMTP_HOST and SMTP_FROM must be configured before creating accounts.")
    port = int(_setting("SMTP_PORT", "Email__SmtpPort") or "587")
    security = _setting("SMTP_SECURITY", "Email__Security").lower()
    username = _setting("SMTP_USERNAME", "Email__Username")
    secret = _setting("SMTP_PASSWORD", "Email__AppPassword")
    message = EmailMessage()
    message["From"] = formataddr((_setting("SMTP_FROM_NAME", "Email__FromName") or "iSQL", sender))
    message["To"] = email
    message["Subject"] = "Your iSQL account"
    message.set_content(
        f"Your iSQL account is ready.\n\nEmail: {email}\nTemporary password: {password}\n\n"
        "You may change your password after signing in.\n"
    )
    use_ssl = security in {"ssl", "smtps"} or port == 465
    connector = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
    with connector(host, port, timeout=15) as smtp:
        if not use_ssl and security != "none":
            smtp.starttls()
        if username:
            smtp.login(username, secret)
        smtp.send_message(message)

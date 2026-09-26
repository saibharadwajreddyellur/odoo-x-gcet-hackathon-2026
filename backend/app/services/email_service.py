import base64
import logging
import os
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.core.config import settings

logger = logging.getLogger("stocksense.email")

# Path to the transparent StockSense brand logo (brand green #16a34a + white Lucide Boxes)
LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "stocksense_logo.png")


class SMTPConfigurationError(Exception):
    """Raised when SMTP settings are incomplete or missing."""
    pass


class SMTPDeliveryError(Exception):
    """Raised when SMTP connection, authentication, or message transmission fails."""
    pass


def send_otp_email(to_email: str, otp_code: str, expires_in_minutes: int = 10) -> bool:
    """
    Sends a 6-digit OTP email to the user for password reset via SMTP.
    Loads host, port, credentials, and TLS settings from app.core.config.settings.

    Raises:
        SMTPConfigurationError: If SMTP host or user is not configured.
        SMTPDeliveryError: If connection, auth, or transmission fails.

    Note:
        Plaintext OTPs are NEVER logged or exposed in logs.
    """
    host = (settings.SMTP_HOST or "").strip()
    user = (settings.SMTP_USER or "").strip()
    port = settings.SMTP_PORT
    password = settings.SMTP_PASSWORD or ""
    use_tls = settings.SMTP_TLS
    from_email = (settings.EMAILS_FROM_EMAIL or "noreply@stocksense.io").strip()
    from_name = (settings.EMAILS_FROM_NAME or "StockSense Security").strip()

    if not host or not user:
        missing = []
        if not host:
            missing.append("SMTP_HOST")
        if not user:
            missing.append("SMTP_USER")
        err_msg = (
            f"SMTP email service is not configured. Missing required variable(s): {', '.join(missing)}. "
            f"Please update backend/.env with your SMTP provider credentials."
        )
        logger.error(f"Cannot dispatch verification email to {to_email}: {err_msg}")
        raise SMTPConfigurationError(err_msg)

    # Load logo image bytes if available for CID embedding
    logo_bytes = None
    if os.path.exists(LOGO_PATH):
        try:
            with open(LOGO_PATH, "rb") as f:
                logo_bytes = f.read()
        except Exception as e:
            logger.warning(f"Could not load logo from {LOGO_PATH}: {e}")

    # Use CID reference if logo is attached, otherwise fallback to embedded base64 data URI
    if logo_bytes:
        img_src = "cid:stocksense-logo"
    else:
        img_src = ""

    subject = "Your StockSense Password Reset Code"

    text_content = f"""Hello,

You requested a password reset for your StockSense account ({to_email}).
Your 6-digit verification code is:

    {otp_code}

This code will expire in {expires_in_minutes} minutes.
If you did not request this password reset, please ignore this email.

Best regards,
The StockSense Team
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }}
    .container {{ max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }}
    .footer {{ margin-top: 28px; font-size: 12px; color: #64748b; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="container">
    <!-- StockSense Brand Header (matches Navbar & Login) -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td style="vertical-align: middle; padding-right: 12px;">
          <img src="{img_src}" alt="StockSense Logo" width="44" height="44" style="display: block; width: 44px; height: 44px; border: 0; outline: none; text-decoration: none; border-radius: 12px;" />
        </td>
        <td style="vertical-align: middle;">
          <div style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.4px; line-height: 1.2;">
            StockSense
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
            Centralized Inventory &amp; Warehouse Control
          </div>
        </td>
      </tr>
    </table>

    <h2 style="font-size: 17px; font-weight: 600; color: #1e293b; margin-top: 0; margin-bottom: 12px;">Password Reset Verification</h2>
    <p style="font-size: 13px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
      You requested to reset the password for your account (<strong>{to_email}</strong>). Enter the 6-digit one-time code below to complete your password update:
    </p>

    <div style="background-color: #f0fdf4; border: 2px dashed #22c55e; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
      <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #15803d;">
        {otp_code}
      </div>
    </div>

    <p style="font-size: 12px; color: #64748b; line-height: 1.5;">
      &#9200; This verification code expires in <strong>{expires_in_minutes} minutes</strong> and can only be used once.
    </p>
    <div class="footer">
      If you did not request this password reset, please ignore this email or contact your administrator immediately. Your account credentials remain secure.
    </div>
  </div>
</body>
</html>
"""

    if logo_bytes:
        # Create standard multipart/related structure for inline email images
        msg = MIMEMultipart("related")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email

        alt_part = MIMEMultipart("alternative")
        alt_part.attach(MIMEText(text_content, "plain"))
        alt_part.attach(MIMEText(html_content, "html"))
        msg.attach(alt_part)

        logo_part = MIMEImage(logo_bytes, "png")
        logo_part.add_header("Content-ID", "<stocksense-logo>")
        logo_part.add_header("Content-Disposition", "inline", filename="stocksense_logo.png")
        msg.attach(logo_part)
    else:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email

        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=15) as server:
                server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                if use_tls:
                    server.starttls()
                if user and password:
                    server.login(user, password)
                server.send_message(msg)

        logger.info(f"Password reset verification email successfully dispatched to {to_email} via SMTP ({host}:{port})")
        return True
    except smtplib.SMTPAuthenticationError as e:
        err_msg = f"SMTP authentication failed on {host}:{port}. Please verify SMTP_USER and SMTP_PASSWORD."
        logger.error(f"Failed to dispatch verification email to {to_email}: {err_msg}")
        raise SMTPDeliveryError(err_msg) from e
    except smtplib.SMTPConnectError as e:
        err_msg = f"Failed to connect to SMTP server at {host}:{port}. Please check host and port settings."
        logger.error(f"Failed to dispatch verification email to {to_email}: {err_msg}")
        raise SMTPDeliveryError(err_msg) from e
    except Exception as e:
        err_msg = f"Failed to send email via SMTP ({host}:{port}): {str(e)}"
        logger.error(f"Failed to dispatch verification email to {to_email}: {err_msg}")
        raise SMTPDeliveryError(err_msg) from e

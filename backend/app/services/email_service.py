import logging
import os

import requests
from app.core.config import settings

logger = logging.getLogger("stocksense.email")

# StockSense logo
LOGO_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "assets",
    "stocksense_logo.png",
)


class SMTPConfigurationError(Exception):
    """Raised when email service configuration is missing."""
    pass


class SMTPDeliveryError(Exception):
    """Raised when Brevo email delivery fails."""
    pass


def send_otp_email(
    to_email: str,
    otp_code: str,
    expires_in_minutes: int = 10,
) -> bool:

    api_key = os.getenv("BREVO_API_KEY", "").strip()

    logger.info(
        "Brevo API key check: present=%s, length=%d, prefix=%s",
        bool(api_key),
        len(api_key),
        api_key[:8] if api_key else "NONE",
    )

    if not api_key:
        error = "BREVO_API_KEY is not configured."
        logger.error(error)
        raise SMTPConfigurationError(error)

    if not api_key:
        error = "BREVO_API_KEY is not configured."
        logger.error(error)
        raise SMTPConfigurationError(error)

    from_email = (
        settings.EMAILS_FROM_EMAIL or "noreply@stocksense.io"
    ).strip()

    from_name = (
        settings.EMAILS_FROM_NAME or "StockSense Security"
    ).strip()

    subject = "Your StockSense Password Reset Code"

    # ---------------------------------------------------------
    # Plain-text email
    # ---------------------------------------------------------
    text_content = f"""Hello,

You requested a password reset for your StockSense account ({to_email}).

Your 6-digit verification code is:

{otp_code}

This code will expire in {expires_in_minutes} minutes and can only be used once.

If you did not request this password reset, please ignore this email.

Best regards,

The StockSense Team
"""

    # ---------------------------------------------------------
    # HTML email
    # ---------------------------------------------------------
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
                Roboto, Helvetica, Arial, sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            margin: 0;
            padding: 24px;
        }}

        .container {{
            max-width: 480px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            border: 1px solid #e2e8f0;
            padding: 32px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }}

        .footer {{
            margin-top: 28px;
            font-size: 12px;
            color: #64748b;
            line-height: 1.5;
            border-top: 1px solid #f1f5f9;
            padding-top: 16px;
        }}
    </style>
</head>

<body>
    <div class="container">

        <!-- StockSense Brand Header -->
        <table
            role="presentation"
            border="0"
            cellpadding="0"
            cellspacing="0"
            style="margin-bottom: 24px;"
        >
            <tr>
                <td style="vertical-align: middle; padding-right: 12px;">
    <img
        src="https://YOUR-VERCEL-DOMAIN/stocksense_logo.png"
        width="44"
        height="44"
        alt="StockSense"
        style="
            display:block;
            width:44px;
            height:44px;
            border:0;
            border-radius:12px;
        "
    >
</td>

                <td style="vertical-align: middle;">
                    <div
                        style="
                            font-size: 20px;
                            font-weight: 700;
                            color: #0f172a;
                            letter-spacing: -0.4px;
                            line-height: 1.2;
                        "
                    >
                        StockSense
                    </div>

                    <div
                        style="
                            font-size: 11px;
                            color: #64748b;
                            margin-top: 2px;
                        "
                    >
                        Centralized Inventory &amp; Warehouse Control
                    </div>
                </td>
            </tr>
        </table>

        <h2
            style="
                font-size: 17px;
                font-weight: 600;
                color: #1e293b;
                margin-top: 0;
                margin-bottom: 12px;
            "
        >
            Password Reset Verification
        </h2>

        <p
            style="
                font-size: 13px;
                line-height: 1.6;
                color: #334155;
                margin-bottom: 16px;
            "
        >
            You requested to reset the password for your
            StockSense account
            (<strong>{to_email}</strong>).
            Enter the 6-digit one-time code below to complete
            your password update:
        </p>

        <div
            style="
                background-color: #f0fdf4;
                border: 2px dashed #22c55e;
                border-radius: 12px;
                padding: 20px;
                text-align: center;
                margin: 24px 0;
            "
        >
            <div
                style="
                    font-size: 32px;
                    font-weight: 800;
                    letter-spacing: 8px;
                    font-family: ui-monospace, SFMono-Regular,
                        Menlo, Monaco, Consolas, monospace;
                    color: #15803d;
                "
            >
                {otp_code}
            </div>
        </div>

        <p
            style="
                font-size: 12px;
                color: #64748b;
                line-height: 1.5;
            "
        >
            &#9200; This verification code expires in
            <strong>{expires_in_minutes} minutes</strong>
            and can only be used once.
        </p>

        <div class="footer">
            If you did not request this password reset, please
            ignore this email or contact your administrator
            immediately. Your account credentials remain secure.
        </div>

    </div>
</body>
</html>
"""

    # ---------------------------------------------------------
    # Brevo API request
    # ---------------------------------------------------------
    payload = {
        "sender": {
            "name": from_name,
            "email": from_email,
        },
        "to": [
            {
                "email": to_email,
            }
        ],
        "subject": subject,
        "textContent": text_content,
        "htmlContent": html_content,
    }

    headers = {
        "accept": "application/json",
        "api-key": api_key,
        "content-type": "application/json",
    }

    try:
        response = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers=headers,
            json=payload,
            timeout=15,
        )

        if response.status_code not in (200, 201, 202):
            logger.error(
                "Brevo email delivery failed with HTTP status %s.",
                response.status_code,
            )

            raise SMTPDeliveryError(
                f"Brevo email delivery failed "
                f"(HTTP {response.status_code})."
            )

        logger.info(
            "Password reset email successfully sent to %s via Brevo.",
            to_email,
        )

        return True

    except requests.RequestException as exc:
        logger.error(
            "Unable to connect to Brevo email service: %s",
            exc,
        )

        raise SMTPDeliveryError(
            "Unable to connect to Brevo email service."
        ) from exc

    except SMTPDeliveryError:
        raise

    except Exception as exc:
        logger.error(
            "Unexpected error while sending password reset email: %s",
            exc,
        )

        raise SMTPDeliveryError(
            "Unexpected error while sending password reset email."
        ) from exc
# Security Guidelines

## Prohibited Content

Do NOT create elements containing:
- API keys, passwords, tokens
- Personal credentials
- Sensitive authentication data

If user provides sensitive data, use placeholders: `[API_KEY]`

## Canvas Capture

Before canvas_capture, check for visible sensitive data.
Warn user if credentials are visible.

## Content Moderation

Decline to create:
- Phishing mockups (fake login screens)
- Deceptive designs
- Harmful instructions

Response: "I can't create that content."

Exception: Educational security diagrams when clearly framed as such.

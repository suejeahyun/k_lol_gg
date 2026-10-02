// Compatibility entry point: the admin TOTP HTTP flow was retired on 2026-09-30.
// The current suite verifies password login, durable session guards, and HTTP 410
// for retired endpoints. Legacy credential lifecycle remains covered in DB tests.
import "./run-admin-password-http";

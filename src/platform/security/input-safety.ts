/**
 * Text controls that can split logs, conceal UI text, or reorder identifiers.
 *
 * Keep this policy shared by every boundary that accepts account/admin text.
 * Unicode format controls (Cf), variation selectors, C0, and C1 are rejected.
 * This intentionally includes ZWJ/ZWNJ: account identities and operational
 * display names favor an unambiguous visible spelling over shaping controls.
 */
const unsafeTextPattern =
  /[\u0000-\u001f\u007f-\u009f\ud800-\udfff\p{Cf}\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/u;

export function containsUnsafeText(value: string): boolean {
  return unsafeTextPattern.test(value);
}

/** SyberLabs product lockup: mark + SYBERLABS / RELAY + the Relay sigil. */
export function Lockup() {
  return (
    <span className="sy-lockup">
      <span aria-hidden="true" className="sy-mark" />
      <span>SyberLabs</span>
      <span aria-hidden="true" className="sy-lockup-sep">
        /
      </span>
      <span>Relay</span>
      <span aria-hidden="true" className="sy-sigil" />
    </span>
  );
}

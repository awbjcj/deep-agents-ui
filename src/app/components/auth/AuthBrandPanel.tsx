/** Aptiv brand column beside auth forms on wide screens; follows the theme. */
export function AuthBrandPanel() {
  return (
    <aside
      className="auth-brand"
      aria-label="About VSDA Deep Agent"
    >
      <header
        className="auth-brand__top"
        translate="no"
      >
        <img
          className="auth-logo auth-logo--light h-6"
          src="/assets/aptiv_logo_color.svg"
          alt="Aptiv"
          width={107}
          height={24}
        />
        <img
          className="auth-logo auth-logo--dark h-6"
          src="/assets/aptiv_logo_white.svg"
          alt="Aptiv"
          width={107}
          height={24}
        />
      </header>

      <div className="auth-brand__body">
        <p
          className="auth-brand__headline"
          translate="no"
        >
          VSDA <span className="auth-brand__highlight">Deep Agent</span>
        </p>
        <p className="auth-brand__lede">
          Delegate engineering work to specialist agents and review their
          actions.
        </p>
      </div>
    </aside>
  );
}

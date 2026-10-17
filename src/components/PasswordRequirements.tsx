import { getPasswordRules } from "../lib/passwordRules";
import styles from "../screens/pages.module.css";

type Props = {
  password: string;
  /** Si es true, muestra el recuadro aunque la contraseña esté vacía. */
  visible?: boolean;
};

export function PasswordRequirements({ password, visible = true }: Props) {
  if (!visible) return null;
  const rules = getPasswordRules(password);
  const allOk = rules.every((r) => r.ok);

  return (
    <div
      className={`${styles.passwordRules} ${allOk ? styles.passwordRulesOk : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.passwordRulesTitle}>La contraseña debe incluir:</div>
      <ul className={styles.passwordRulesList}>
        {rules.map((rule) => (
          <li key={rule.id} className={rule.ok ? styles.passwordRuleOk : styles.passwordRulePending}>
            <span className={styles.passwordRuleMark} aria-hidden>
              {rule.ok ? "✓" : "○"}
            </span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

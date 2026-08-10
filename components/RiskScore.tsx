import type { AgentView } from "@/lib/utils/view";
import { shortAddress } from "@/lib/utils/format";

const WEIGHTS: Record<keyof AgentView["components"], { label: string; weight: number }> = {
  projectedHeadroom: { label: "Post-mint headroom", weight: 0.5 },
  currentHealth: { label: "Current collateral health", weight: 0.25 },
  capacityBuffer: { label: "Capacity buffer", weight: 0.15 },
  fee: { label: "Fee", weight: 0.1 },
};

/**
 * Shows how the score was assembled. Every component is normalised to [0,1]
 * and multiplied by a fixed, published weight — there is no hidden term.
 */
export function RiskScore({ agent }: { agent: AgentView }) {
  const keys = Object.keys(WEIGHTS) as (keyof AgentView["components"])[];

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
          Score breakdown
        </span>
        <span className="num text-xs text-[var(--color-muted)]">
          {shortAddress(agent.agentVault)}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {keys.map((key) => {
          const { label, weight } = WEIGHTS[key];
          const value = agent.components[key];
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-[var(--color-muted)]">
                  {label}
                  <span className="num ml-1.5 text-[var(--color-faint)]">x{weight}</span>
                </span>
                <span className="num text-[var(--color-text)]">
                  {value.toFixed(3)}
                  <span className="ml-2 text-[var(--color-faint)]">
                    = {(value * weight).toFixed(3)}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1 w-full bg-[var(--color-surface-2)]">
                <div
                  className="h-full bg-[var(--color-accent)]"
                  style={{ width: `${Math.max(value * 100, 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-[var(--color-line)] pt-3">
        <span className="text-xs text-[var(--color-muted)]">Final score</span>
        <span className="num text-lg text-[var(--color-accent)]">{agent.score.toFixed(4)}</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
        Components saturate at 1.0. Fee is weighted below every safety term by
        design, so a cheaper agent can never outrank a materially safer one.
      </p>
    </div>
  );
}

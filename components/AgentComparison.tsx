import type { AgentView, RankingView } from "@/lib/utils/view";
import {
  fee,
  fxrp,
  fxrpPrecise,
  headroom,
  ratio,
  riskBand,
} from "@/lib/utils/format";

/**
 * The centrepiece: every live agent as a ranked card, with the safest
 * redemption agent accented and the difference spelled out in numbers that all
 * trace back to chain state.
 */
export function AgentComparison({ view }: { view: RankingView }) {
  if (!view.agents.length) {
    return (
      <div className="border border-[var(--color-bad)]/40 bg-[var(--color-bad)]/[0.06] p-6">
        <div className="text-sm font-medium text-[var(--color-bad)]">
          {view.comparison.headline}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">
          {view.comparison.detail}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {view.agents.map((a) => (
          <AgentCard
            key={a.agentVault}
            agent={a}
            view={view}
            title={a.agentVault === view.recommendedVault ? "Safest redemption agent" : a.eligible ? `Alternative #${a.rank}` : `Ineligible #${a.rank}`}
            subtitle={a.agentVault === view.recommendedVault ? "strongest crash-resilient backing" : a.eligible ? "same backing pool, different risk" : "cannot safely cover a redemption"}
            accent={a.agentVault === view.recommendedVault}
          />
        ))}
      </div>

      <div className="border-l-2 border-[var(--color-accent)] bg-[var(--color-surface)] px-5 py-4">
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
          {view.feeSpreadExists ? "Why not the cheapest agent?" : "Why this agent?"}
        </div>
        <div className="mt-1.5 text-[15px] leading-snug text-[var(--color-text)]">
          {view.comparison.headline}
        </div>
        <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-[var(--color-muted)]">
          {view.comparison.detail}
        </p>
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  view,
  title,
  subtitle,
  accent = false,
}: {
  agent: AgentView;
  view: RankingView;
  title: string;
  subtitle: string;
  accent?: boolean;
}) {
  const band = riskBand(
    agent.bindingLeg.projectedHeadroomBIPS,
    agent.bindingLeg.liquidationThresholdBIPS,
  );

  return (
    <div
      className={`border bg-[var(--color-surface)] p-5 ${
        accent ? "border-[var(--color-accent)]/50" : "border-[var(--color-line)]"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span
          className={`text-[11px] uppercase tracking-wider ${
            accent ? "text-[var(--color-accent)]" : "text-[var(--color-faint)]"
          }`}
        >
          {title}
        </span>
        <span className="num text-[11px] text-[var(--color-faint)]">rank #{agent.rank}</span>
      </div>

      <div className="num mt-2 text-lg break-all">{agent.agentVault}</div>
      <div className="mt-0.5 text-xs text-[var(--color-muted)]">{subtitle}</div>

      <div className="mt-4 space-y-0">
        <Metric label="Safety band" value={<span className={band.className}>{band.label}</span>} />
        <Metric label="Minting fee" value={`${fee(agent.feeBIPS)}  ·  ${fxrpPrecise(agent.feeAmountUBA, view.assetUnitUBA)} FXRP`} />
        <Metric
          label={`Binding leg (${agent.bindingLeg.label})`}
          value={`${agent.bindingLeg.tokenSymbol} collateral`}
        />
        <Metric label="Current CR" value={ratio(agent.bindingLeg.currentRatioBIPS)} />
        <Metric
          label="Projected CR"
          value={ratio(agent.bindingLeg.projectedRatioBIPS)}
          emphasis
        />
        <Metric
          label="Liquidation CR"
          value={ratio(agent.bindingLeg.liquidationThresholdBIPS)}
        />
        <Metric
          label="Projected headroom"
          value={
            <span className={band.className}>
              {headroom(agent.bindingLeg.projectedHeadroomBIPS)}
            </span>
          }
          emphasis
        />
        <Metric
          label="Available capacity"
          value={`${fxrp(agent.availableCapacityUBA, view.assetUnitUBA)} FXRP`}
        />
        <Metric label="Share of FXRP backing" value={`${agent.shareOfBackingPct.toFixed(1)}%`} />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--color-line)] py-1.5 last:border-0">
      <span className="text-xs text-[var(--color-muted)]">{label}</span>
      <span
        className={`num text-sm ${emphasis ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"}`}
      >
        {value}
      </span>
    </div>
  );
}

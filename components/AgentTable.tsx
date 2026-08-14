import type { AgentView, RankingView } from "@/lib/utils/view";
import { applyShock, formatShock } from "@/lib/scoring/stress";
import {
  REASON_LABELS,
  fee,
  fxrp,
  headroom,
  ratio,
  riskBand,
  shortAddress,
} from "@/lib/utils/format";

/**
 * The full leaderboard. Every column is a value read from, or derived by a
 * documented formula from, Coston2 state at the snapshot block. When a what-if
 * price shock is active, an extra column shows each agent's post-shock
 * projected headroom so the user can see which agents survive an adverse move.
 * Note: under the current FAssets model there is no "mint agent" — this board
 * shows the collateral standing behind the FXRP in circulation and which agents
 * remain safe to redeem with.
 */
export function AgentTable({
  view,
  shockBips = 0,
}: {
  view: RankingView;
  shockBips?: number;
}) {
  return (
    <div className="overflow-x-auto border border-[var(--color-line)] bg-[var(--color-surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line)] text-left text-[11px] uppercase tracking-wider text-[var(--color-faint)]">
            <Th className="w-12">#</Th>
            <Th>Agent vault</Th>
            <Th>Risk</Th>
            <Th className="text-right">Binding leg</Th>
            <Th className="text-right">Current CR</Th>
            <Th className="text-right">Post-mint CR</Th>
            <Th className="text-right">Liq. at</Th>
            <Th className="text-right">Headroom</Th>
            {shockBips !== 0 && (
              <Th className="text-right">If {formatShock(shockBips)}</Th>
            )}
            <Th className="text-right">Capacity</Th>
            <Th className="text-right">Fee</Th>
            <Th className="text-right">Score</Th>
          </tr>
        </thead>
        <tbody>
          {view.agents.map((agent) => (
            <Row
              key={agent.agentVault}
              agent={agent}
              view={view}
              isRecommended={agent.agentVault === view.recommendedVault}
              shockBips={shockBips}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-medium ${className}`}>{children}</th>;
}

function Row({
  agent,
  view,
  isRecommended,
  shockBips = 0,
}: {
  agent: AgentView;
  view: RankingView;
  isRecommended: boolean;
  shockBips?: number;
}) {
  const band = riskBand(
    agent.bindingLeg.projectedHeadroomBIPS,
    agent.bindingLeg.liquidationThresholdBIPS,
  );

  const shockedHeadroomBIPS =
    shockBips !== 0
      ? applyShock(
          BigInt(agent.bindingLeg.projectedRatioBIPS ?? "0"),
          shockBips,
        ) - BigInt(agent.bindingLeg.liquidationThresholdBIPS)
      : null;
  const shockedBreached =
    shockedHeadroomBIPS !== null && shockedHeadroomBIPS < 0n;

  return (
    <>
      <tr
        className={`border-b border-[var(--color-line)] ${
          isRecommended
            ? "bg-[var(--color-accent)]/[0.07]"
            : agent.eligible
              ? ""
              : "opacity-45"
        }`}
      >
        <td className="num px-3 py-3 text-[var(--color-faint)]">
          {isRecommended && (
            <span className="mr-1 text-[var(--color-accent)]" aria-label="recommended">
              ▸
            </span>
          )}
          {agent.rank}
        </td>
        <td className="num px-3 py-3">
          <span className={isRecommended ? "text-[var(--color-accent)]" : ""}>
            {shortAddress(agent.agentVault)}
          </span>
        </td>
        <td className={`px-3 py-3 text-[11px] font-medium tracking-wide ${band.className}`}>
          {band.label}
        </td>
        <td className="px-3 py-3 text-right text-[var(--color-muted)]">
          {agent.bindingLeg.label}
          <span className="num ml-1 text-[var(--color-faint)]">
            {agent.bindingLeg.tokenSymbol}
          </span>
        </td>
        <td className="num px-3 py-3 text-right">
          {ratio(agent.bindingLeg.currentRatioBIPS)}
        </td>
        <td className="num px-3 py-3 text-right">
          {ratio(agent.bindingLeg.projectedRatioBIPS)}
        </td>
        <td className="num px-3 py-3 text-right text-[var(--color-faint)]">
          {ratio(agent.bindingLeg.liquidationThresholdBIPS)}
        </td>
        <td className={`num px-3 py-3 text-right ${band.className}`}>
          {headroom(agent.bindingLeg.projectedHeadroomBIPS)}
        </td>
        {shockBips !== 0 && (
          <td
            className={`num px-3 py-3 text-right ${
              shockedBreached
                ? "text-[var(--color-bad)]"
                : "text-[var(--color-warn)]"
            }`}
          >
            {headroom(shockedHeadroomBIPS?.toString() ?? null)}
          </td>
        )}
        <td className="num px-3 py-3 text-right text-[var(--color-muted)]">
          {fxrp(agent.availableCapacityUBA, view.assetUnitUBA)}
        </td>
        <td className="num px-3 py-3 text-right">{fee(agent.feeBIPS)}</td>
        <td className="num px-3 py-3 text-right text-[var(--color-muted)]">
          {agent.score.toFixed(3)}
        </td>
      </tr>
      {!agent.eligible && (
        <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface-2)]">
          <td />
          <td colSpan={shockBips !== 0 ? 11 : 10} className="px-3 py-1.5 text-xs text-[var(--color-bad)]">
            ineligible —{" "}
            {agent.ineligibilityReasons
              .map((r) => REASON_LABELS[r] ?? r)
              .join("; ")}
          </td>
        </tr>
      )}
    </>
  );
}

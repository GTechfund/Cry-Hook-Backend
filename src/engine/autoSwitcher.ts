// src/engine/autoSwitcher.ts
// Client & Engine TypeScript implementation of the Strategy Auto-Preset Switcher

export interface AutoSwitcherTier {
  id: 'TIER_1_MICRO' | 'TIER_2_HYBRID' | 'TIER_3_ALPHA';
  name: string;
  minBalance: number;
  maxBalance: number;
  leverage: number;
  riskCapPct: number;
  maxRiskDollarCap: number;
  tp1Dist: number;
  tp2Dist: number;
  tp2AtrMult: number;
  slAtrMult: number;
  defaultMargin: number;
  compoundRate: number;
  description: string;
}

export const AUTO_SWITCHER_TIERS: Record<string, AutoSwitcherTier> = {
  TIER_1_MICRO: {
    id: 'TIER_1_MICRO',
    name: 'Peak Win Rate Mode (20x LSD)',
    minBalance: 0,
    maxBalance: 99.9999,
    leverage: 20,
    riskCapPct: 0.10, // 10%
    maxRiskDollarCap: 3.00, // $3.00 max
    tp1Dist: 0.30,
    tp2Dist: 0.55,
    tp2AtrMult: 0.85,
    slAtrMult: 1.8,
    defaultMargin: 11.0,
    compoundRate: 0.15,
    description: 'Capital preservation for micro-balances ($0-$100). 20x leverage keeps fee drag < 1.6% and limits loss to ~$0.65 - $3.00 max.',
  },
  TIER_2_HYBRID: {
    id: 'TIER_2_HYBRID',
    name: 'Hybrid Scaling Tier (35x)',
    minBalance: 100.00,
    maxBalance: 249.9999,
    leverage: 35,
    riskCapPct: 0.10, // 10%
    maxRiskDollarCap: 10.00, // $10.00 max
    tp1Dist: 0.35,
    tp2Dist: 0.70,
    tp2AtrMult: 1.00,
    slAtrMult: 1.6,
    defaultMargin: 25.0,
    compoundRate: 0.25,
    description: 'Balanced acceleration for intermediate balances ($100-$250). 35x leverage with widened TP2 to capture multi-candle extensions.',
  },
  TIER_3_ALPHA: {
    id: 'TIER_3_ALPHA',
    name: 'Max Alpha Mode (50x)',
    minBalance: 250.00,
    maxBalance: Infinity,
    leverage: 50,
    riskCapPct: 0.10, // 10%
    maxRiskDollarCap: 25.00, // $25.00 max
    tp1Dist: 0.35,
    tp2Dist: 0.85,
    tp2AtrMult: 1.20,
    slAtrMult: 1.5,
    defaultMargin: 60.0,
    compoundRate: 0.35,
    description: 'Maximum velocity compounding for accounts $250+. 50x leverage captures full macro drift moves with a strict $25 risk cap.',
  },
};

export function getTierForBalance(balance: number): AutoSwitcherTier {
  const bal = Math.max(0, balance || 0);
  if (bal < 100.00) return AUTO_SWITCHER_TIERS.TIER_1_MICRO;
  if (bal < 250.00) return AUTO_SWITCHER_TIERS.TIER_2_HYBRID;
  return AUTO_SWITCHER_TIERS.TIER_3_ALPHA;
}

export function applyTierToConfig<T extends { startBalance: number; leverage: number; compoundRate: number; tp1Dist: number; slAtrMult: number; autoSwitchPresets?: boolean }>(
  cfg: T,
  overrideBalance?: number,
): T {
  const bal = overrideBalance !== undefined ? overrideBalance : cfg.startBalance;
  const tier = getTierForBalance(bal);
  return {
    ...cfg,
    autoSwitchPresets: true,
    leverage: tier.leverage,
    compoundRate: tier.compoundRate,
    tp1Dist: tier.tp1Dist,
    slAtrMult: tier.slAtrMult,
  };
}

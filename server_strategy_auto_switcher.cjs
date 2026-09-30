// server_strategy_auto_switcher.cjs
// Dynamic Regime-Optimized Strategy Auto-Preset Switcher
// Automatically switches trading presets, leverage tiers, risk caps, and profit targets
// based on real-time account equity tiers and enforces the 2-Loss Chop Circuit Breaker.

/**
 * Tier Specifications:
 * Tier 1: $0.00 - $99.99     -> Peak Win Rate Mode (20x LSD, 10% Risk Cap max $3.00, TP2 +0.55 / +0.85 ATR)
 * Tier 2: $100.00 - $249.99 -> Hybrid Scaling Tier (35x, 10% Risk Cap max $10.00, TP2 +0.70 / +1.00 ATR)
 * Tier 3: $250.00+          -> Max Alpha Mode (50x/60x, 10% Risk Cap max $25.00, TP2 +0.85 / +1.20 ATR)
 */

const TIERS = {
  TIER_1_MICRO: {
    id: 'TIER_1_MICRO',
    name: 'Peak Win Rate Mode (20x LSD)',
    minBalance: 0,
    maxBalance: 99.9999,
    maxOpenPositions: 1, // $0 - $99.99 allows strictly 1 position
    leverage: 20,
    riskCapPct: 0.10, // 10% of equity
    maxRiskDollarCap: 3.00, // Maximum -$3.00 loss
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
    maxOpenPositions: 2, // $100 - $249.99 allows up to 2 positions
    leverage: 35,
    riskCapPct: 0.10, // 10% of equity
    maxRiskDollarCap: 10.00, // Maximum -$10.00 loss
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
    maxOpenPositions: 3, // $250+ allows up to 3 positions
    leverage: 50,
    riskCapPct: 0.10, // 10% of equity
    maxRiskDollarCap: 25.00, // Maximum -$25.00 loss
    tp1Dist: 0.35,
    tp2Dist: 0.85,
    tp2AtrMult: 1.20,
    slAtrMult: 1.5,
    defaultMargin: 60.0,
    compoundRate: 0.35,
    description: 'Maximum velocity compounding for accounts $250+. 50x leverage captures full macro drift moves with a strict $25 risk cap.',
  },
};

// Internal Switcher State
const state = {
  enabled: true,
  currentBar: 0,
  tradeHistory: [],
  recentLossBars: [],
  consecutiveLosses: 0,
  standbyBarsRemaining: 0,
  circuitBreakerActive: false,
  lastTriggerReason: null,
};

/**
 * Resolves the active preset based on current account equity.
 * @param {number} balance Current wallet/account equity in USD
 * @returns {object} Tier definition
 */
function getPresetForBalance(balance) {
  const bal = Math.max(0, parseFloat(balance) || 0);
  if (bal < 100.00) {
    return TIERS.TIER_1_MICRO;
  }
  if (bal < 250.00) {
    return TIERS.TIER_2_HYBRID;
  }
  return TIERS.TIER_3_ALPHA;
}

/**
 * Advance current market bar index (e.g. on new 15m candle)
 * Decrements circuit breaker standby if active.
 */
function tickBar(barIndex) {
  if (typeof barIndex === 'number') {
    state.currentBar = barIndex;
  } else {
    state.currentBar += 1;
  }

  if (state.standbyBarsRemaining > 0) {
    state.standbyBarsRemaining -= 1;
    if (state.standbyBarsRemaining <= 0) {
      state.circuitBreakerActive = false;
      state.lastTriggerReason = 'Standby completed. Engine resumed.';
      console.log(`[CIRCUIT BREAKER] 5-bar Yellow Standby concluded. Engine resumed to Normal Active Mode.`);
    }
  }
}

/**
 * Evaluates an incoming trade signal against the auto-switcher tier and circuit breaker rules.
 * @param {object} currentSignal Incoming signal parameters (price, direction, asset, atr, etc.)
 * @param {number} accountBalance Current account equity in USD
 * @param {number} [barIndex] Current candle index
 * @returns {object} Trade decision object
 */
function evaluateTradeSignal(currentSignal = {}, accountBalance = 240, barIndex) {
  if (typeof barIndex === 'number') {
    tickBar(barIndex);
  }

  const balance = Math.max(0, parseFloat(accountBalance) || 0);
  const preset = getPresetForBalance(balance);

  // 1. Check Circuit Breaker (2-Loss Chop Circuit Breaker -> 5-bar Sit-Out)
  if (state.circuitBreakerActive && state.standbyBarsRemaining > 0) {
    return {
      execute: false,
      reason: `CIRCUIT_BREAKER_ACTIVE: 2 consecutive losses within 10 bars. In Yellow Standby Mode (${state.standbyBarsRemaining} bars remaining).`,
      preset,
      tier: preset.id,
      balance,
      circuitBreaker: {
        active: true,
        standbyBarsRemaining: state.standbyBarsRemaining,
        consecutiveLosses: state.consecutiveLosses,
      },
    };
  }

  // 2. Minimum Account Lockout Check ($10 Jupiter safety lockout)
  if (balance < 10.00) {
    return {
      execute: false,
      reason: `LOCKOUT_FLOOR_HIT: Account balance $${balance.toFixed(2)} is below the minimum $10.00 Jupiter safety lockout.`,
      preset,
      tier: preset.id,
      balance,
      circuitBreaker: { active: false, standbyBarsRemaining: 0, consecutiveLosses: state.consecutiveLosses },
    };
  }

  // 3. Compute Risk Cap for this Trade
  // Enforces 10% equity risk cap, capped at tier max ($3.00 for Tier 1, $10.00 for Tier 2, $25.00 for Tier 3)
  const equityRisk10Pct = balance * preset.riskCapPct;
  const maxDollarLoss = Math.min(equityRisk10Pct, preset.maxRiskDollarCap);

  // 4. Compute Margin & Position Sizing
  const compoundRate = currentSignal.compoundRate !== undefined ? currentSignal.compoundRate : preset.compoundRate;
  let margin = 0;
  if (compoundRate === 0) {
    margin = preset.defaultMargin;
  } else {
    margin = Math.max(11.0, balance * compoundRate);
  }

  // Cap margin so that a standard stop loss does not instantly exceed maxDollarLoss
  const leverage = preset.leverage;
  const notional = margin * leverage;

  // 5. Dynamic Targets (Fee-Neutral TP1 and Dynamic TP2)
  const price = parseFloat(currentSignal.price) || 140.0;
  const curATR = parseFloat(currentSignal.atr) || 0.35;
  const tp1Dist = parseFloat(currentSignal.tp1) || preset.tp1Dist;
  
  // TP2 ATR calculation: based on user specs (+0.55 / +0.85 ATR for Tier 1, +0.70 / +1.00 ATR for Tier 2, +0.85 / +1.20 ATR for Tier 3)
  const dynamicTp2FromAtr = curATR * preset.tp2AtrMult;
  const tp2Dist = Math.max(preset.tp2Dist, dynamicTp2FromAtr);

  // 6. Stop Loss distance calculation with strict equity risk cap clamp
  const slAtrDist = curATR * preset.slAtrMult;
  const fullFeeEst = notional * 0.0008; // 0.08% roundtrip fee
  const tokens = notional / price;
  
  // Max price distance allowed before loss exceeds maxDollarLoss:
  // (slPriceDist * tokens) + fullFeeEst <= maxDollarLoss
  const maxLossPriceDist = tokens > 0 && maxDollarLoss > fullFeeEst
    ? (maxDollarLoss - fullFeeEst) / tokens
    : slAtrDist;
  const effectiveSlDist = Math.min(slAtrDist, maxLossPriceDist);

  const direction = (currentSignal.direction || currentSignal.side || 'Long').toLowerCase();
  const isLong = direction === 'long' || direction === 'buy' || direction === 'green';

  const entryOffset = Math.max(0.08, parseFloat(currentSignal.entryOffset) || 0.25 * curATR);
  const entryPrice = isLong ? price - entryOffset : price + entryOffset;
  const stopLoss = isLong ? entryPrice - effectiveSlDist : entryPrice + effectiveSlDist;
  const takeProfit1 = isLong ? entryPrice + tp1Dist : entryPrice - tp1Dist;
  const takeProfit2 = isLong ? entryPrice + tp2Dist : entryPrice - tp2Dist;

  return {
    execute: true,
    preset: {
      name: preset.name,
      tier: preset.id,
      description: preset.description,
      leverage: preset.leverage,
      riskCapPct: preset.riskCapPct,
      maxRiskDollarCap: preset.maxRiskDollarCap,
    },
    tier: preset.id,
    leverage: preset.leverage,
    margin: parseFloat(margin.toFixed(2)),
    notional: parseFloat(notional.toFixed(2)),
    entryPrice: parseFloat(entryPrice.toFixed(4)),
    stopLoss: parseFloat(stopLoss.toFixed(4)),
    tp1: parseFloat(takeProfit1.toFixed(4)),
    tp2: parseFloat(takeProfit2.toFixed(4)),
    tp1Dist: parseFloat(tp1Dist.toFixed(4)),
    tp2Dist: parseFloat(tp2Dist.toFixed(4)),
    maxDollarLoss: parseFloat(maxDollarLoss.toFixed(2)),
    effectiveSlDist: parseFloat(effectiveSlDist.toFixed(4)),
    circuitBreaker: {
      active: state.circuitBreakerActive,
      standbyBarsRemaining: state.standbyBarsRemaining,
      consecutiveLosses: state.consecutiveLosses,
    },
  };
}

/**
 * Called whenever a trade settles.
 * Evaluates consecutive losses to trigger the 2-Loss Chop Circuit Breaker.
 * @param {number} netPnlUsd Realized net profit/loss in USD
 * @param {object} [details] Optional trade info (exitBar, reason, etc.)
 */
function onTradeSettled(netPnlUsd, details = {}) {
  const pnl = parseFloat(netPnlUsd) || 0;
  const exitBar = typeof details.exitBar === 'number' ? details.exitBar : state.currentBar;

  state.tradeHistory.push({
    pnl,
    exitBar,
    timestamp: Date.now(),
    reason: details.reason || (pnl >= 0 ? 'WIN' : 'LOSS'),
  });

  if (pnl < 0) {
    state.recentLossBars.push(exitBar);
    state.consecutiveLosses += 1;

    // Check if 2 consecutive stop losses occurred within 10 bars
    if (state.recentLossBars.length >= 2) {
      const len = state.recentLossBars.length;
      const lastLossBar = state.recentLossBars[len - 1];
      const prevLossBar = state.recentLossBars[len - 2];

      if (lastLossBar - prevLossBar <= 10 && state.consecutiveLosses >= 2) {
        state.circuitBreakerActive = true;
        state.standbyBarsRemaining = 5;
        state.lastTriggerReason = `2 consecutive stop losses within 10 bars (bars ${prevLossBar} & ${lastLossBar}). Engaged 5-bar Yellow Standby Mode.`;
        console.warn(`⚠️ [CIRCUIT BREAKER TRIGGERED] ${state.lastTriggerReason}`);
      }
    }
  } else {
    // Win or breakeven reset consecutive loss count
    state.consecutiveLosses = 0;
  }

  return {
    circuitBreakerActive: state.circuitBreakerActive,
    standbyBarsRemaining: state.standbyBarsRemaining,
    consecutiveLosses: state.consecutiveLosses,
    lastTriggerReason: state.lastTriggerReason,
  };
}

/**
 * Returns full diagnostics of the auto-preset switcher.
 */
function getAutoSwitcherState(balance = 240) {
  const activePreset = getPresetForBalance(balance);
  return {
    enabled: state.enabled,
    balance: parseFloat(balance),
    activeTier: activePreset.id,
    activePreset,
    tiers: TIERS,
    circuitBreaker: {
      active: state.circuitBreakerActive,
      standbyBarsRemaining: state.standbyBarsRemaining,
      consecutiveLosses: state.consecutiveLosses,
      lastTriggerReason: state.lastTriggerReason,
      recentLossCount: state.recentLossBars.length,
    },
    currentBar: state.currentBar,
    totalTradesLogged: state.tradeHistory.length,
  };
}

/**
 * Manually reset the circuit breaker back to active state.
 */
function resetCircuitBreaker() {
  state.circuitBreakerActive = false;
  state.standbyBarsRemaining = 0;
  state.consecutiveLosses = 0;
  state.recentLossBars = [];
  state.lastTriggerReason = 'Manually reset by user.';
  console.log('[CIRCUIT BREAKER] Reset by operator. Returning to Active Ready state.');
}

module.exports = {
  TIERS,
  getPresetForBalance,
  evaluateTradeSignal,
  onTradeSettled,
  tickBar,
  getAutoSwitcherState,
  resetCircuitBreaker,
};

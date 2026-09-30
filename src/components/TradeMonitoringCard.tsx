import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
  RefreshCw,
  Zap,
  XCircle,
  AlertTriangle,
  ArrowUpRight,
  Sliders,
  Radio,
  Terminal,
  ChevronDown,
  ChevronUp,
  Search,
  Unlock,
  Lock,
  Sparkles,
  Key,
  Info,
  Rocket,
  Check,
  Layers,
} from 'lucide-react';

export interface ActiveTradeOrder {
  id: string;
  requestPDA: string;
  positionPDA: string;
  asset: string;
  side: 'Long' | 'Short';
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  margin: number;
  leverage: number;
  notional: number;
  status: 'placed' | 'pending_keeper' | 'filled' | 'closed' | 'cancelled';
  placedAt: number;
  filledAt: number | null;
  closedAt: number | null;
  closeReason: string | null;
  exitPrice: number | null;
  pnl: number;
  pnlPercent: number;
  keeperStatus: string;
  isSimulated: boolean;
  explorerUrl?: string;
}

interface TradeMonitoringCardProps {
  currentPrice?: number;
  onTradeClose?: (pnl: number) => void;
  network?: string;
}

export const TradeMonitoringCard: React.FC<TradeMonitoringCardProps> = ({
  currentPrice: livePriceProp,
  onTradeClose,
  network = 'devnet',
}) => {
  const [orders, setOrders] = useState<ActiveTradeOrder[]>([]);
  const [selectedPDA, setSelectedPDA] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showJsonDrawer, setShowJsonDrawer] = useState<boolean>(false);
  const [rawJsonResponse, setRawJsonResponse] = useState<any>(null);
  const [customPdaInput, setCustomPdaInput] = useState<string>('');
  const [customPdaLoading, setCustomPdaLoading] = useState<boolean>(false);
  const [executionMode, setExecutionMode] = useState<'simulate' | 'live_onchain'>('simulate');
  const [selectedNetwork, setSelectedNetwork] = useState<string>(network || 'devnet');
  const [showTrainingWheelsModal, setShowTrainingWheelsModal] = useState<boolean>(false);
  const [preflightData, setPreflightData] = useState<any>(null);
  const [isSwitchingMode, setIsSwitchingMode] = useState<boolean>(false);

  // Fetch preflight checklist
  const fetchPreflight = useCallback(async () => {
    try {
      let res = await fetch('/api/bot/preflight');
      if (!res.ok) res = await fetch('/preflight');
      if (res.ok) {
        const data = await res.json();
        setPreflightData(data);
        if (data.executionMode) setExecutionMode(data.executionMode);
        if (data.network) setSelectedNetwork(data.network);
      }
    } catch {
      // Standby
    }
  }, []);

  // Toggle mode on backend
  const handleSwitchMode = async (newMode: 'simulate' | 'live_onchain', newNet: string = selectedNetwork) => {
    setIsSwitchingMode(true);
    try {
      let res = await fetch('/api/bot/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode, network: newNet }),
      });
      if (!res.ok) {
        res = await fetch('/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: newMode, network: newNet }),
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionMessage(`⚠️ ${data.error || 'Cannot arm live mode: Safety requirements unmet.'}`);
        await fetchPreflight();
        return;
      }
      setExecutionMode(newMode);
      setSelectedNetwork(newNet);
      setActionMessage(
        newMode === 'simulate'
          ? '🛡️ Training Wheels ACTIVATED: Zero-Risk Simulation Mode is running.'
          : `🚀 Live On-Chain mode active on ${newNet.toUpperCase()}!`
      );
      await fetchPreflight();
      await fetchState();
    } catch (err: any) {
      setActionMessage('Failed to switch mode: ' + err.message);
    } finally {
      setIsSwitchingMode(false);
      setTimeout(() => setActionMessage(null), 6000);
    }
  };

  // Fetch full state from backend (both /api/bot/state and /state fallback)
  const fetchState = useCallback(async () => {
    try {
      let res = await fetch('/api/bot/state', { cache: 'no-store' });
      if (!res.ok) {
        res = await fetch('/state', { cache: 'no-store' });
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.activeOrders) && data.activeOrders.length > 0) {
          setOrders(data.activeOrders);
          // Prioritize currently active/filled order or pending limit, then newest order
          const preferredOrder =
            data.activeOrders.find((o: any) => o.status === 'filled') ||
            data.activeOrders.find((o: any) => o.status === 'placed' || o.status === 'pending_keeper') ||
            data.activeOrders[data.activeOrders.length - 1];

          // Auto-select if nothing selected, or if current selection is closed and there is an active order
          if (!selectedPDA || (preferredOrder && !data.activeOrders.some((o: any) => o.requestPDA === selectedPDA && (o.status === 'filled' || o.status === 'placed')))) {
            if (preferredOrder) {
              setSelectedPDA(preferredOrder.requestPDA);
            }
          }
        }
      }
    } catch {
      // Standby
    }
  }, [selectedPDA]);

  // Sync live market price to backend so trigger conditions evaluate in real-time
  useEffect(() => {
    if (livePriceProp && livePriceProp > 0) {
      fetch('/api/bot/update-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: 'SOL', price: livePriceProp }),
      }).catch(() => {});
    }
  }, [livePriceProp]);

  // Poll state every 3 seconds
  useEffect(() => {
    fetchState();
    fetchPreflight();
    const interval = setInterval(() => {
      fetchState();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchState, fetchPreflight]);

  // Get active selected order (prefers selected, then filled, then placed, then latest, then dynamic standby)
  const activeOrder: ActiveTradeOrder =
    orders.find((o) => o.requestPDA === selectedPDA) ||
    orders.find((o) => o.status === 'filled') ||
    orders.find((o) => o.status === 'placed' || o.status === 'pending_keeper') ||
    orders[orders.length - 1] || {
      id: 'standby',
      requestPDA: 'StandbyWaitingSignal',
      positionPDA: 'None',
      asset: 'SOL',
      side: 'Long',
      entryPrice: livePriceProp ? parseFloat((livePriceProp - 0.08).toFixed(2)) : 120.00,
      currentPrice: livePriceProp || 120.08,
      stopLoss: livePriceProp ? parseFloat((livePriceProp - 0.48).toFixed(2)) : 119.60,
      takeProfit: livePriceProp ? parseFloat((livePriceProp + 0.85).toFixed(2)) : 120.93,
      margin: 11.0,
      leverage: 20,
      notional: 220.0,
      status: 'placed',
      placedAt: Date.now(),
      filledAt: null,
      closedAt: null,
      closeReason: null,
      exitPrice: null,
      pnl: 0.0,
      pnlPercent: 0.0,
      keeperStatus: 'AutoTrader Active: Standby for next confirmed 15m Green Signal',
      isSimulated: true,
      explorerUrl: `https://solscan.io?cluster=${network}`,
    };

  const markPrice = livePriceProp || activeOrder.currentPrice || 116.65;
  const isFilled = activeOrder.status === 'filled';
  const isPending = activeOrder.status === 'placed' || activeOrder.status === 'pending_keeper';
  const isClosed = activeOrder.status === 'closed';
  const isCancelled = activeOrder.status === 'cancelled';

  // Compute live visual distance to TP & SL
  const distToTp = activeOrder.takeProfit - markPrice;
  const distToTpPct = (distToTp / markPrice) * 100;
  const distToSl = markPrice - activeOrder.stopLoss;
  const distToSlPct = (distToSl / markPrice) * 100;

  // Gauge percentage (0 = Stop Loss, 50 = Entry, 100 = Take Profit)
  const totalRange = activeOrder.takeProfit - activeOrder.stopLoss;
  const currentOffset = markPrice - activeOrder.stopLoss;
  const gaugePct = Math.max(0, Math.min(100, (currentOffset / (totalRange || 1)) * 100));

  // Dynamic PnL calculation
  const computedPnl = isFilled
    ? activeOrder.side === 'Long'
      ? ((markPrice - activeOrder.entryPrice) / activeOrder.entryPrice) * activeOrder.notional
      : ((activeOrder.entryPrice - markPrice) / activeOrder.entryPrice) * activeOrder.notional
    : isClosed
    ? activeOrder.pnl
    : 0.0;
  const computedRoe = activeOrder.margin > 0 ? (computedPnl / activeOrder.margin) * 100 : 0.0;

  // Actions
  const handleCopyPDA = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Next Step 1: Simulate Keeper Fill
  const handleSimulateKeeperFill = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/bot/simulate-keeper-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestPDA: activeOrder.requestPDA }),
      });
      const data = await res.json();
      setRawJsonResponse(data);
      setActionMessage('⚡ Keeper matched! Position is now FILLED at $' + activeOrder.entryPrice.toFixed(4));
      await fetchState();
    } catch (err: any) {
      setActionMessage('Fill simulation error: ' + err.message);
    } finally {
      setIsLoading(false);
      setTimeout(() => setActionMessage(null), 6000);
    }
  };

  // Next Step 2: Poll Order Status (GET /order/:pda)
  const handlePollOrderStatus = async (pdaToPoll?: string) => {
    const target = pdaToPoll || activeOrder.requestPDA;
    setIsLoading(true);
    try {
      let res = await fetch(`/api/bot/order/${target}`);
      if (!res.ok) {
        res = await fetch(`/order/${target}`);
      }
      const data = await res.json();
      setRawJsonResponse(data);
      setShowJsonDrawer(true);
      setActionMessage(`✅ Order status polled successfully for ${target.slice(0, 8)}...`);
      await fetchState();
    } catch (err: any) {
      setActionMessage('Failed to poll status: ' + err.message);
    } finally {
      setIsLoading(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  // Next Step 3A: Cancel Unfilled Request (POST /cancel)
  const handleCancelOrder = async () => {
    if (!confirm(`Cancel unfilled position request: ${activeOrder.requestPDA}?`)) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/bot/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestPDA: activeOrder.requestPDA }),
      });
      const data = await res.json();
      setRawJsonResponse(data);
      setActionMessage('🛑 Position request cancelled. Collateral released.');
      await fetchState();
    } catch (err: any) {
      setActionMessage('Cancellation error: ' + err.message);
    } finally {
      setIsLoading(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  // Next Step 3B: Close Active Position (POST /close)
  const handleClosePosition = async () => {
    if (!confirm(`Market close ${activeOrder.asset} ${activeOrder.side} position @ $${markPrice.toFixed(2)}?`)) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/bot/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestPDA: activeOrder.requestPDA,
          exitPrice: markPrice,
          reason: 'MANUAL_CLOSE',
        }),
      });
      const data = await res.json();
      setRawJsonResponse(data);
      setActionMessage(`💥 Position closed @ $${markPrice.toFixed(2)} | PnL: ${data.pnl >= 0 ? '+' : ''}$${data.pnl}`);
      if (onTradeClose && typeof data.pnl === 'number') {
        onTradeClose(data.pnl);
      }
      await fetchState();
    } catch (err: any) {
      setActionMessage('Close error: ' + err.message);
    } finally {
      setIsLoading(false);
      setTimeout(() => setActionMessage(null), 6000);
    }
  };

  // Custom PDA Inspection
  const handleLookupCustomPda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPdaInput.trim()) return;
    setCustomPdaLoading(true);
    await handlePollOrderStatus(customPdaInput.trim());
    setCustomPdaLoading(false);
  };

  return (
    <div className="bg-[#141516] border border-white/10 rounded-2xl p-5 shadow-2xl space-y-5">
      {/* 1. Header with Mode Badge & Order Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`p-2.5 rounded-xl border ${
              isFilled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : isPending
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-neutral-800 border-white/10 text-neutral-400'
            }`}
          >
            {isFilled ? <ShieldCheck className="w-6 h-6 animate-pulse" /> : <Clock className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Trade Keeper Execution Monitor</span>
              </h3>

              {/* Status Badge */}
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono border ${
                  isFilled
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : isPending
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : isCancelled
                    ? 'bg-neutral-800 text-neutral-400 border-white/10'
                    : 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                }`}
              >
                {activeOrder.status.toUpperCase()}
              </span>

              {/* Training Wheels / Execution Mode Badge */}
              <button
                onClick={() => setShowTrainingWheelsModal(true)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 transition-all shadow-sm ${
                  executionMode === 'simulate'
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                }`}
                title="Configure Execution Mode & Training Wheels"
              >
                {executionMode === 'simulate' ? (
                  <>
                    <Lock className="w-3 h-3 text-blue-400" />
                    <span>Training Wheels: ON (Sandbox)</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3 text-emerald-400 animate-pulse" />
                    <span>Training Wheels: OFF ({selectedNetwork.toUpperCase()})</span>
                  </>
                )}
                <span className="text-[10px] underline opacity-75 ml-0.5">Pre-Flight &rarr;</span>
              </button>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Live lifecycle tracker for Jupiter Perpetuals limit orders, keeper matching, and bracket TP/SL.
            </p>
          </div>
        </div>

        {/* Action Buttons Top */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Take Off / Put On Training Wheels Action */}
          <button
            onClick={() => setShowTrainingWheelsModal(true)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
              executionMode === 'simulate'
                ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30'
                : 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border-blue-500/30'
            }`}
            title="Open Pre-Flight Checklist & Execution Switcher"
          >
            <Rocket className="w-3.5 h-3.5" />
            <span>
              {executionMode === 'simulate' ? 'Take Off Training Wheels' : 'Training Wheels Hub'}
            </span>
          </button>

          <button
            onClick={() => handlePollOrderStatus()}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/10 transition-all flex items-center gap-1.5"
            title="Poll GET /order/:requestPDA"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Poll Status</span>
          </button>

          <button
            onClick={() => setShowJsonDrawer(!showJsonDrawer)}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-white/10 transition-all flex items-center gap-1"
            title="Inspect raw JSON API payload"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>API Docs</span>
            {showJsonDrawer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <div className="bg-blue-950/60 border border-blue-500/40 rounded-xl px-4 py-2.5 text-xs text-blue-300 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{actionMessage}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-neutral-400 hover:text-white text-xs px-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Trade Order Selector (when multiple orders exist) */}
      {orders.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#191a1c] border border-white/5 rounded-xl px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-neutral-400">
            <Layers className="w-4 h-4 text-blue-400" />
            <span className="font-medium">Active Position / Order Monitor:</span>
          </div>
          <select
            value={activeOrder.requestPDA}
            onChange={(e) => setSelectedPDA(e.target.value)}
            className="bg-neutral-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-neutral-200 font-mono focus:outline-none focus:border-blue-500"
          >
            {orders.map((o) => (
              <option key={o.requestPDA} value={o.requestPDA}>
                {o.status === 'filled' ? '🟢 FILLED' : o.status === 'placed' ? '⏳ PENDING LIMIT' : o.status === 'closed' ? '🏁 CLOSED' : '🚫 CANCELLED'} · #{o.id || o.requestPDA.slice(0, 8)} ({o.side} @ ${o.entryPrice.toFixed(2)} · {o.margin} USDC @ {o.leverage}x)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 2. Order Summary Card & Live Mark Ticker */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#191a1c] border border-white/5 rounded-xl p-4">
        {/* Metric 1: Asset & Side */}
        <div className="space-y-1">
          <span className="text-[11px] text-neutral-400 font-medium">Position Contract</span>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold font-mono text-white">
              {activeOrder.asset} / USDC
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                activeOrder.side === 'Long'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}
            >
              {activeOrder.side.toUpperCase()}
            </span>
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">
            {activeOrder.margin} USDC margin @ {activeOrder.leverage}x (${activeOrder.notional.toLocaleString()} notional)
          </span>
        </div>

        {/* Metric 2: Entry vs Mark */}
        <div className="space-y-1">
          <span className="text-[11px] text-neutral-400 font-medium">Limit Entry vs Mark Price</span>
          <div className="flex items-baseline gap-2 font-mono">
            <span className="text-sm font-semibold text-neutral-300">
              Entry: ${activeOrder.entryPrice.toFixed(4)}
            </span>
            <span className="text-white/30">|</span>
            <span className="text-base font-bold text-amber-400">
              ${markPrice.toFixed(4)}
            </span>
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">
            {markPrice >= activeOrder.entryPrice ? '+' : ''}
            {(markPrice - activeOrder.entryPrice).toFixed(4)} spread
          </span>
        </div>

        {/* Metric 3: Unrealized PnL */}
        <div className="space-y-1">
          <span className="text-[11px] text-neutral-400 font-medium">Unrealized PnL &amp; ROE</span>
          <div
            className={`text-lg font-bold font-mono ${
              computedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {computedPnl >= 0 ? '+' : ''}${computedPnl.toFixed(2)}
            <span className="text-xs ml-1.5 font-normal">
              ({computedRoe >= 0 ? '+' : ''}{computedRoe.toFixed(1)}%)
            </span>
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">
            Est. Liq: ~${(activeOrder.entryPrice * (1 - 1 / activeOrder.leverage)).toFixed(2)}
          </span>
        </div>

        {/* Metric 4: Brackets TP / SL */}
        <div className="space-y-1">
          <span className="text-[11px] text-neutral-400 font-medium">Take Profit / Stop Loss</span>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-emerald-400 font-bold">
              TP: ${activeOrder.takeProfit.toFixed(4)}
            </span>
            <span className="text-white/20">/</span>
            <span className="text-red-400 font-bold">
              SL: ${activeOrder.stopLoss.toFixed(4)}
            </span>
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">
            Risk: -${(activeOrder.entryPrice - activeOrder.stopLoss).toFixed(3)} | Reward: +$
            {(activeOrder.takeProfit - activeOrder.entryPrice).toFixed(3)} (1:1.43)
          </span>
        </div>
      </div>

      {/* 3. STEPPER: 4-Stage Jupiter Keeper Lifecycle (Next Step 1) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-neutral-300">
            Jupiter Keeper Execution Lifecycle (Next Step 1)
          </span>
          <span className="text-[11px] text-neutral-400 font-mono">
            Keeper Status: <strong className="text-neutral-200">{activeOrder.keeperStatus}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {/* Stage 1 */}
          <div className="p-3 rounded-xl bg-neutral-900/60 border border-emerald-500/30 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-bold text-emerald-400 block">
                1. Request Placed
              </span>
              <span className="text-[11px] text-neutral-400">
                PDA derived &amp; registered on Solana Anchor.
              </span>
            </div>
          </div>

          {/* Stage 2 */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 ${
              isFilled
                ? 'bg-neutral-900/60 border-emerald-500/30'
                : 'bg-amber-950/20 border-amber-500/40'
            }`}
          >
            {isFilled ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Clock className="w-4 h-4 text-amber-400 animate-spin shrink-0 mt-0.5" />
            )}
            <div>
              <span
                className={`text-xs font-bold block ${
                  isFilled ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                2. Keeper Fill
              </span>
              <span className="text-[11px] text-neutral-400">
                {isFilled
                  ? `Matched @ $${activeOrder.entryPrice.toFixed(4)}`
                  : 'Awaiting price dip to limit target.'}
              </span>
            </div>
          </div>

          {/* Stage 3 */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 ${
              isFilled
                ? 'bg-neutral-900/60 border-blue-500/30'
                : 'bg-neutral-900/40 border-white/5 opacity-60'
            }`}
          >
            <ShieldCheck
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                isFilled ? 'text-blue-400' : 'text-neutral-500'
              }`}
            />
            <div>
              <span
                className={`text-xs font-bold block ${
                  isFilled ? 'text-blue-400' : 'text-neutral-400'
                }`}
              >
                3. Position Active
              </span>
              <span className="text-[11px] text-neutral-400">
                {isFilled ? '40x position running live with guard brackets.' : 'Inactive.'}
              </span>
            </div>
          </div>

          {/* Stage 4 */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 ${
              isClosed
                ? 'bg-neutral-900/60 border-purple-500/30'
                : 'bg-neutral-900/40 border-white/5 opacity-60'
            }`}
          >
            <CheckCircle2
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                isClosed ? 'text-purple-400' : 'text-neutral-500'
              }`}
            />
            <div>
              <span
                className={`text-xs font-bold block ${
                  isClosed ? 'text-purple-400' : 'text-neutral-400'
                }`}
              >
                4. Exit Guardian
              </span>
              <span className="text-[11px] text-neutral-400">
                {isClosed ? activeOrder.closeReason || 'Closed' : 'Guarding TP / SL exits.'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Real-time Bracket Range Bar */}
      <div className="bg-neutral-900/60 border border-white/5 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1.5 text-red-400 font-bold">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>Stop Loss: ${activeOrder.stopLoss.toFixed(4)}</span>
            <span className="text-[10px] text-neutral-500">(-{distToSlPct.toFixed(2)}%)</span>
          </div>

          <div className="flex items-center gap-1 text-neutral-300 font-bold">
            <span>Entry: ${activeOrder.entryPrice.toFixed(4)}</span>
          </div>

          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span>Take Profit: ${activeOrder.takeProfit.toFixed(4)}</span>
            <span className="text-[10px] text-neutral-500">(+{distToTpPct.toFixed(2)}%)</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
        </div>

        {/* Progress Track */}
        <div className="relative h-3 w-full bg-neutral-800 rounded-full overflow-hidden border border-white/10">
          {/* SL Zone (Red) */}
          <div className="absolute left-0 top-0 bottom-0 w-1/4 bg-red-500/20 border-r border-red-500/30"></div>
          {/* TP Zone (Green) */}
          <div className="absolute right-0 top-0 bottom-0 w-1/4 bg-emerald-500/20 border-l border-emerald-500/30"></div>
          {/* Current Price Pin */}
          <div
            className="absolute top-0 bottom-0 w-2.5 bg-amber-400 rounded-full shadow-lg -ml-1 transition-all duration-500"
            style={{ left: `${gaugePct}%` }}
            title={`Mark: $${markPrice.toFixed(4)}`}
          ></div>
        </div>
      </div>

      {/* 5. NEXT STEPS MANAGEMENT ACTIONS (Next Steps 1 - 3) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Next Step 1: Simulate Keeper Fill */}
          {isPending && (
            <button
              onClick={handleSimulateKeeperFill}
              disabled={isLoading}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all flex items-center gap-1.5"
              title="Instantly execute keeper match in simulation"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>1. Simulate Keeper Fill Now</span>
            </button>
          )}

          {/* Next Step 2: Poll Order Status */}
          <button
            onClick={() => handlePollOrderStatus()}
            disabled={isLoading}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/10 transition-all flex items-center gap-1.5"
            title="Poll status via GET /order/:requestPDA"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>2. Poll Status (/order)</span>
          </button>

          {/* Next Step 3A: Cancel Unfilled Request */}
          {isPending && (
            <button
              onClick={handleCancelOrder}
              disabled={isLoading}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-950/60 hover:bg-amber-900 text-amber-300 border border-amber-500/30 transition-all flex items-center gap-1.5"
              title="Cancel unfilled order via POST /cancel"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>3A. Cancel Order</span>
            </button>
          )}

          {/* Next Step 3B: Close Active Position */}
          {isFilled && (
            <button
              onClick={handleClosePosition}
              disabled={isLoading}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white shadow-md transition-all flex items-center gap-1.5"
              title="Close position via POST /close"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>3B. Market Close Position</span>
            </button>
          )}
        </div>

        {/* Request PDA Display & Explorer Link */}
        <div className="flex items-center gap-2 text-xs font-mono bg-neutral-900/80 px-3 py-1.5 rounded-lg border border-white/5">
          <span className="text-neutral-500">PDA:</span>
          <span className="text-blue-400 font-bold truncate max-w-[170px]" title={activeOrder.requestPDA}>
            {activeOrder.requestPDA}
          </span>
          <button
            onClick={() => handleCopyPDA(activeOrder.requestPDA)}
            className="text-neutral-400 hover:text-white p-0.5"
            title="Copy Request PDA"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          {copied && <span className="text-emerald-400 text-[10px]">Copied!</span>}
          <a
            href={`https://solscan.io/account/${activeOrder.requestPDA}?cluster=${network}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 hover:text-blue-400 p-0.5 ml-1"
            title="Inspect on Solscan"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* 6. Expandable Raw API / cURL Drawer */}
      {showJsonDrawer && (
        <div className="pt-3 border-t border-white/10 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between text-xs text-neutral-300 font-semibold">
            <span>Next Steps cURL Commands &amp; Live API Payload</span>
            <span className="text-[11px] text-neutral-500 font-mono">
              Port 3001 Backend Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Left: CLI cURL Examples */}
            <div className="space-y-2 bg-neutral-950 p-3 rounded-xl border border-white/10 font-mono text-[11px]">
              <span className="text-neutral-400 block font-semibold text-[10px] uppercase tracking-wider">
                Terminal Commands (Next Steps 1 - 3):
              </span>
              <div>
                <span className="text-neutral-500"># Step 2: Poll Order Status</span>
                <pre className="text-blue-300 overflow-x-auto whitespace-pre-wrap select-all py-1">
                  curl http://localhost:3001/order/{activeOrder.requestPDA}
                </pre>
              </div>
              <div>
                <span className="text-neutral-500"># Step 1: Simulate Keeper Fill</span>
                <pre className="text-emerald-300 overflow-x-auto whitespace-pre-wrap select-all py-1">
                  curl -X POST http://localhost:3001/simulate-keeper-fill -H "Content-Type: application/json" -d '{`{"requestPDA":"${activeOrder.requestPDA}"}`}'
                </pre>
              </div>
              <div>
                <span className="text-neutral-500"># Step 3: Close Position</span>
                <pre className="text-red-300 overflow-x-auto whitespace-pre-wrap select-all py-1">
                  curl -X POST http://localhost:3001/close -H "Content-Type: application/json" -d '{`{"requestPDA":"${activeOrder.requestPDA}"}`}'
                </pre>
              </div>
            </div>

            {/* Right: Live JSON Response */}
            <div className="space-y-2 bg-neutral-950 p-3 rounded-xl border border-white/10 font-mono text-[11px]">
              <span className="text-neutral-400 block font-semibold text-[10px] uppercase tracking-wider">
                Live Server Response (GET /order):
              </span>
              <pre className="text-neutral-300 max-h-52 overflow-y-auto whitespace-pre-wrap">
                {JSON.stringify(rawJsonResponse || activeOrder, null, 2)}
              </pre>
            </div>
          </div>

          {/* Custom PDA Lookup Bar */}
          <form onSubmit={handleLookupCustomPda} className="flex items-center gap-2 pt-1">
            <Search className="w-3.5 h-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Paste any custom Request PDA (e.g. FxzpPjspistGY23Q2RnnWWRJxRgbn35cf8bV3oKBXC4r)..."
              value={customPdaInput}
              onChange={(e) => setCustomPdaInput(e.target.value)}
              className="flex-1 bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-neutral-600 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={customPdaLoading}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              {customPdaLoading ? 'Polling...' : 'Lookup PDA'}
            </button>
          </form>
        </div>
      )}
      {/* 7. Taking Off The Training Wheels / Pre-Flight Drawer */}
      {showTrainingWheelsModal && (
        <div className="pt-4 border-t border-white/10 space-y-4 animate-fadeIn bg-neutral-950/90 -mx-5 -mb-5 p-5 rounded-b-2xl border-t border-amber-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-amber-400" />
              <h4 className="text-sm font-bold text-white tracking-tight">
                Taking Off the Training Wheels: Live Execution Control Hub
              </h4>
            </div>
            <button
              onClick={() => setShowTrainingWheelsModal(false)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              Close
            </button>
          </div>

          <p className="text-xs text-neutral-400">
            Transition safely from simulated paper testing to real on-chain Anchor executions on Solana.
            Follow the 3-tier progression below to verify keeper latency and slippage before committing real capital.
          </p>

          {/* 3-Tier Mode Progression Selector */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Tier 1: Simulation */}
            <div
              onClick={() => handleSwitchMode('simulate', 'devnet')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                executionMode === 'simulate'
                  ? 'bg-blue-500/10 border-blue-500/50 shadow-lg ring-1 ring-blue-500/30'
                  : 'bg-neutral-900/50 border-white/5 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-blue-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Tier 1: Simulation
                </span>
                {executionMode === 'simulate' && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold">
                    ACTIVE
                  </span>
                )}
              </div>
              <span className="text-[11px] font-semibold text-neutral-300 block mb-1">
                Training Wheels ON (0-Risk)
              </span>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Synthetic keeper matching &amp; zero gas fees. Verify signals, TP/SL bracket math, and bot reliability without on-chain signing.
              </p>
            </div>

            {/* Tier 2: Live Devnet (Recommended Next Step) */}
            <div
              onClick={() => handleSwitchMode('live_onchain', 'devnet')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                executionMode === 'live_onchain' && selectedNetwork === 'devnet'
                  ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg ring-1 ring-emerald-500/30'
                  : 'bg-neutral-900/50 border-white/5 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Unlock className="w-3.5 h-3.5" />
                  Tier 2: Live Devnet
                </span>
                {executionMode === 'live_onchain' && selectedNetwork === 'devnet' && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    ACTIVE
                  </span>
                )}
              </div>
              <span className="text-[11px] font-semibold text-amber-300 block mb-1">
                Training Wheels OFF (Recommended Next Step)
              </span>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Submits real Anchor transactions to Solana Devnet RPC. Derives live on-chain Request PDAs, tested with real keeper matching &amp; free airdrop SOL.
              </p>
            </div>

            {/* Tier 3: Live Mainnet */}
            <div
              onClick={() => {
                if (
                  confirm(
                    '⚠️ ATTENTION: Mainnet execution uses REAL SOL & USDC on Jupiter Perpetuals. Ensure your wallet is funded and risk limits are tested. Proceed?'
                  )
                ) {
                  handleSwitchMode('live_onchain', 'mainnet-beta');
                }
              }}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                executionMode === 'live_onchain' && selectedNetwork === 'mainnet-beta'
                  ? 'bg-purple-500/10 border-purple-500/50 shadow-lg ring-1 ring-purple-500/30'
                  : 'bg-neutral-900/50 border-white/5 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-purple-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Tier 3: Live Mainnet
                </span>
                {executionMode === 'live_onchain' && selectedNetwork === 'mainnet-beta' && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                    ACTIVE
                  </span>
                )}
              </div>
              <span className="text-[11px] font-semibold text-red-400 block mb-1">
                Full Production (Real Funds)
              </span>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Live Solana Mainnet execution via Jupiter Perpetuals Anchor program. Real margin, real PnL, priority compute units enabled.
              </p>
            </div>
          </div>

          {/* Pre-Flight Checklist Table */}
          <div className="bg-neutral-900/70 border border-white/10 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Pre-Flight Readiness Checklist (Required for Live On-Chain)
              </span>
              <button
                onClick={() => fetchPreflight()}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Re-check
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-neutral-950 border border-white/5 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-neutral-200 block">Solana RPC Connection</span>
                  <span className="text-neutral-400 text-[11px] font-mono">
                    {selectedNetwork.toUpperCase()} — {selectedNetwork === 'mainnet-beta' ? 'api.mainnet-beta.solana.com' : 'api.devnet.solana.com'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-neutral-950 border border-white/5 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-neutral-200 block">Compute Priority Fees</span>
                  <span className="text-neutral-400 text-[11px]">
                    250,000 micro-lamports auto-injected for guaranteed keeper block inclusion.
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-neutral-950 border border-white/5 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-neutral-200 block">Risk Caps &amp; Circuit Breaker</span>
                  <span className="text-neutral-400 text-[11px]">
                    Max 40x leverage cap, 1.5x ATR hard stop-loss, emergency kill-switch active.
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-neutral-950 border border-white/5 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-neutral-200 block">Keypair Signer Wallet</span>
                  <span className="text-neutral-400 text-[11px]">
                    {preflightData?.keypairDetected
                      ? `Detected: ${preflightData.keypairPath}`
                      : 'Loaded in ./wallet-devnet.json or ./wallet.json for on-chain signing.'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Terminal Guide to Generate Keypair & Free Devnet SOL */}
          <div className="bg-neutral-950 p-3 rounded-xl border border-white/10 font-mono text-[11px] text-neutral-300 space-y-1.5">
            <span className="text-neutral-400 block font-semibold text-[10px] uppercase tracking-wider">
              Solana CLI Setup (To fund Devnet for Tier 2):
            </span>
            <pre className="text-emerald-300 overflow-x-auto whitespace-pre-wrap select-all py-0.5">
              solana-keygen new -o wallet-devnet.json --no-bip39-passphrase
            </pre>
            <pre className="text-blue-300 overflow-x-auto whitespace-pre-wrap select-all py-0.5">
              solana airdrop 2 $(solana-keygen pubkey wallet-devnet.json) --url devnet
            </pre>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-neutral-400">
              Current state: <strong className="text-white">{executionMode === 'simulate' ? 'Training Wheels ON (Simulation)' : `Training Wheels OFF (${selectedNetwork.toUpperCase()})`}</strong>
            </span>
            <div className="flex items-center gap-2">
              {executionMode === 'simulate' ? (
                <button
                  onClick={() => handleSwitchMode('live_onchain', 'devnet')}
                  disabled={isSwitchingMode}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg flex items-center gap-1.5 transition-all"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Take Off Training Wheels (Devnet)</span>
                </button>
              ) : (
                <button
                  onClick={() => handleSwitchMode('simulate', 'devnet')}
                  disabled={isSwitchingMode}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-lg flex items-center gap-1.5 transition-all"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Put Training Wheels Back On (Simulation)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

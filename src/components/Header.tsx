import React from 'react';
import {
  Activity,
  Download,
  Play,
  ShieldAlert,
  Sparkles,
  Zap,
  Radio,
  Cpu,
  FlaskConical,
  Clock,
  Layers,
} from 'lucide-react';

export type DashboardWindow = 'LIVE_VIEW' | 'AUTOTRADE' | 'BACKTEST';

interface HeaderProps {
  activeWindow: DashboardWindow;
  onSelectWindow: (w: DashboardWindow) => void;
  currentAsset: string;
  solPrice?: number;
  priceChange?: number;
  onSelectAsset?: (asset: string) => void;
  updateIntervalSecs?: number;
  setUpdateIntervalSecs?: (secs: number) => void;
  isRunning: boolean;
  onRun: () => void;
  onOpenMonteCarlo: () => void;
  onResetDefaults: () => void;
  onExportCSV?: () => void;
  hasTrades?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeWindow,
  onSelectWindow,
  currentAsset,
  solPrice,
  priceChange,
  onSelectAsset,
  updateIntervalSecs = 5,
  setUpdateIntervalSecs,
  isRunning,
  onRun,
  onOpenMonteCarlo,
  onResetDefaults,
  onExportCSV,
  hasTrades = false,
}) => {
  const assetGlyph = currentAsset === 'SOL' ? '◎' : currentAsset === 'BTC' ? '₿' : 'Ξ';

  return (
    <header className="border-b border-white/10 pb-4 mb-5 space-y-4">
      {/* Top Meta Status Row (Matching Screenshot 1) */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-xs font-mono font-semibold border border-blue-500/30">
            <Zap className="w-3.5 h-3.5" />
            <span>SOL SNIPER v10.5</span>
          </div>

          {/* High-Visibility Active Asset Highlight Pill */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-mono font-bold border border-purple-500/50 shadow-sm shadow-purple-500/20 animate-pulse">
            <span className="text-white text-sm">{assetGlyph}</span>
            <span>ACTIVE ASSET: {currentAsset}/USDT</span>
            {solPrice !== undefined && (
              <span className="text-emerald-400 font-black">${solPrice.toFixed(2)}</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-mono font-semibold border border-emerald-500/30">
            <Activity className="w-3.5 h-3.5" />
            <span>JUMP-DIFFUSION &amp; GARCH</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 text-xs font-mono font-semibold border border-purple-500/30">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>CAPITAL PRESERVATION FLOOR</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-neutral-400 text-[11px] font-mono flex-wrap">
          {/* High-Frequency Update Switcher Badge */}
          {setUpdateIntervalSecs && (
            <div className="flex items-center gap-1 bg-neutral-900 border border-white/10 rounded-lg px-2 py-0.5">
              <Clock className="w-3 h-3 text-emerald-400" />
              <span className="text-neutral-400">Stream:</span>
              {[3, 5, 10, 15].map((sec) => (
                <button
                  key={sec}
                  onClick={() => setUpdateIntervalSecs(sec)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    updateIntervalSecs === sec
                      ? 'bg-emerald-500 text-black'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                  title={`Update telemetry every ${sec} seconds`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-neutral-500" />
            <span>SESSION:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
              24/7 LIVE
            </span>
          </div>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            <span>JUPITER:</span>
            <span className="text-blue-400 font-bold">DEVNET READY</span>
          </div>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>FEED:</span>
            <span className="text-emerald-400 font-bold">LIVE ({updateIntervalSecs}s)</span>
          </div>
        </div>
      </div>

      {/* Main Title Banner & High-Visibility Active Asset Hero Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pt-1">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              SOLSniper Dashboard
            </h1>

            {/* Prominent Active Asset Banner with Quick Selector */}
            <div className="flex items-center gap-2 bg-gradient-to-r from-purple-950/50 to-neutral-900 border border-purple-500/40 rounded-xl px-3 py-1.5 shadow-lg">
              <div className="w-7 h-7 rounded-lg bg-purple-600/30 border border-purple-400/50 flex items-center justify-center font-black text-sm text-purple-200">
                {assetGlyph}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">Active Asset:</span>
                  <span className="text-sm font-black font-mono text-white">{currentAsset}</span>
                  {solPrice !== undefined && (
                    <span className="text-sm font-mono font-bold text-emerald-400 tabular-nums">
                      ${solPrice.toFixed(2)}
                    </span>
                  )}
                  {priceChange !== undefined && (
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${priceChange >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                      {priceChange >= 0 ? `+${priceChange.toFixed(2)}%` : `${priceChange.toFixed(2)}%`}
                    </span>
                  )}
                </div>
              </div>

              {/* 1-Click Switchers directly in Header */}
              {onSelectAsset && (
                <div className="flex items-center gap-1 ml-2 pl-2 border-l border-white/15">
                  {(['SOL', 'BTC', 'ETH'] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => onSelectAsset(a)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all ${
                        currentAsset === a
                          ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-300'
                          : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-neutral-400 mt-1 max-w-4xl leading-relaxed">
            Real-Time Multi-Regime Solana Reversal Monitor, Jupiter Devnet Auto-Trader, and Jump-Diffusion Backtest Lab
          </p>
        </div>

        {/* Global Action Toolbar (Context-sensitive) */}
        {activeWindow === 'BACKTEST' && (
          <div className="flex items-center gap-2 flex-wrap pt-2 lg:pt-0">
            {onExportCSV && (
              <button
                onClick={onExportCSV}
                disabled={!hasTrades || isRunning}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/30 transition-all flex items-center gap-1.5 disabled:opacity-40"
                title="Download trade ledgers as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            )}

            <a
              href="/jupiter.js"
              download="jupiter.js"
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 border border-indigo-500/30 transition-all flex items-center gap-1.5"
              title="Download jupiter.js"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">jupiter.js</span>
            </a>

            <button
              onClick={onOpenMonteCarlo}
              disabled={isRunning}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/10 transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Monte Carlo</span>
            </button>

            <button
              onClick={onResetDefaults}
              disabled={isRunning}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 border border-white/10 transition-all"
            >
              Reset
            </button>

            <button
              onClick={onRun}
              disabled={isRunning}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isRunning ? 'Running...' : 'Run Simulation'}</span>
            </button>
          </div>
        )}
      </div>

      {/* WINDOWS NAVIGATION TABS (Exact Match with Screenshot 1 & 2) */}
      <div className="pt-2">
        <div className="flex items-center gap-2 p-1.5 bg-[#141516] border border-white/10 rounded-xl overflow-x-auto">
          {/* Tab 1: SOLSniper Dashboard */}
          <button
            onClick={() => onSelectWindow('LIVE_VIEW')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeWindow === 'LIVE_VIEW'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-neutral-300 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${activeWindow === 'LIVE_VIEW' ? 'animate-pulse text-emerald-300' : ''}`} />
            <span>SOLSNIPER DASHBOARD</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                activeWindow === 'LIVE_VIEW'
                  ? 'bg-blue-900/60 text-blue-200 border border-blue-400/30'
                  : 'bg-neutral-800 text-emerald-400'
              }`}
            >
              LIVE
            </span>
          </button>

          {/* Tab 2: AutoTrade Jupiter */}
          <button
            onClick={() => onSelectWindow('AUTOTRADE')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeWindow === 'AUTOTRADE'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-neutral-300 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>AUTOTRADE JUPITER</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                activeWindow === 'AUTOTRADE'
                  ? 'bg-blue-900/60 text-blue-200 border border-blue-400/30'
                  : 'bg-neutral-800 text-emerald-400'
              }`}
            >
              READY
            </span>
          </button>

          {/* Tab 3: Simulation / Backtest */}
          <button
            onClick={() => onSelectWindow('BACKTEST')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeWindow === 'BACKTEST'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-neutral-300 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>SIMULATION / BACKTEST</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                activeWindow === 'BACKTEST'
                  ? 'bg-blue-900/60 text-blue-200 border border-blue-400/30'
                  : 'bg-neutral-800 text-purple-400'
              }`}
            >
              LAB
            </span>
          </button>
        </div>

        {/* Selected View Info Sub-Row */}
        <div className="flex items-center gap-4 text-[11px] text-neutral-400 mt-2 px-1">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block"></span>
            <span>Live Streaming:</span>
            <strong className="text-neutral-200">ON</strong>
          </div>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-1.5">
            <span>Selected Asset:</span>
            <strong className="text-amber-400">{currentAsset}</strong>
          </div>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-1.5">
            <span>Active Window:</span>
            <strong className="text-white">
              {activeWindow === 'LIVE_VIEW' && 'Live Sniper Monitor'}
              {activeWindow === 'AUTOTRADE' && 'Jupiter Devnet Execution Terminal'}
              {activeWindow === 'BACKTEST' && 'Jump-Diffusion Multi-Regime Backtester'}
            </strong>
          </div>
        </div>
      </div>
    </header>
  );
};

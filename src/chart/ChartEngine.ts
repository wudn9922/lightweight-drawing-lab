import {
  createChart,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
  type Time,
  type SeriesMarker,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type MouseEventParams,
} from 'lightweight-charts';
import { restoreViewRange, type ViewRange } from './ChartPreferences';
import { TimeMapper } from './TimeMapper';
import { ChartTransform } from './ChartTransform';
import { DrawingStateMachine } from '../drawing/DrawingStateMachine';
import { DrawingPrimitive } from '../drawing/DrawingPrimitive';
import { DrawingController } from '../drawing/DrawingController';
import { IndicatorEngine } from '../indicators/IndicatorEngine';
import { drawingVisible, type ToolKind, type DrawingStyle, type ActiveTool, type Drawing } from '../drawing/DrawingModel';
import type { IndicatorInstance } from '../indicators/IndicatorRegistry';
import type { Bar, BarResult, Timeframe } from '../market-data/MarketDataProvider';
import type { StrategyResult } from '../strategy';
import type { FilingEvent } from '../events/FilingEvents';
export interface ChartCallbacks {
  defaults?: (type: ToolKind) => Partial<DrawingStyle>;
  commit: (symbol: string, drawings: Drawing[], label: string) => void;
  selection: (id: string | null) => void;
  tool: (t: ActiveTool) => void;
  view: (symbol: string, timeframe: Timeframe, range: ViewRange) => void;
}
export class ChartEngine {
  readonly chart: IChartApi;
  readonly candles: ISeriesApi<'Candlestick'>;
  readonly volume: ISeriesApi<'Histogram'>;
  readonly indicators: IndicatorEngine;
  private markers: ISeriesMarkersPluginApi<Time>;
  private researchMarkers: SeriesMarker<Time>[] = [];
  private eventMarkers: SeriesMarker<Time>[] = [];
  private corporateMarkers: SeriesMarker<Time>[] = [];
  controller: DrawingController | null = null;
  mapper: TimeMapper | null = null;
  private symbol = '';
  private timeframe: Timeframe = '1D';
  private bars: Bar[] = [];
  private revision = 0;
  private barIndices = new Map<number, number>();
  private allDrawings: Drawing[] = [];
  private ohlcRaf = 0;
  private ohlcBar: Bar | null = null;
  private viewTimer: ReturnType<typeof setTimeout> | null = null;
  private header: HTMLElement;
  private sourceLabel: HTMLElement;
  constructor(
    readonly host: HTMLElement,
    header: HTMLElement,
    sourceLabel: HTMLElement,
    private callbacks: ChartCallbacks,
  ) {
    this.header = header;
    this.sourceLabel = sourceLabel;
    this.chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0e1521' },
        textColor: '#8290a5',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        attributionLogo: true,
      },
      grid: { vertLines: { color: '#1a2332' }, horzLines: { color: '#1a2332' } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#73849b', width: 1, labelBackgroundColor: '#31415a' },
        horzLine: { color: '#73849b', width: 1, labelBackgroundColor: '#31415a' },
      },
      rightPriceScale: {
        borderColor: '#243043',
        minimumWidth: 64,
        scaleMargins: { top: 0.16, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#243043',
        rightOffset: 40,
        barSpacing: 6,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      localization: { locale: 'en-US' },
    });
    this.candles = this.chart.addSeries(CandlestickSeries, {
      upColor: '#39baa0',
      downColor: '#ef6b7b',
      borderVisible: false,
      wickUpColor: '#39baa0',
      wickDownColor: '#ef6b7b',
      priceLineColor: '#39baa0',
    });
    this.markers = createSeriesMarkers(this.candles, [], { autoScale: false });
    this.volume = this.chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    this.volume.priceScale().applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } });
    this.indicators = new IndicatorEngine(this.chart);
    this.chart.subscribeCrosshairMove(this.crosshair);
    host.addEventListener('pointerup', this.scheduleView);
    host.addEventListener('wheel', this.scheduleView, { passive: true });
  }
  clear() {
    this.flushView();
    this.detachController();
    this.indicators.clear();
    this.chart.clearCrosshairPosition();
    this.researchMarkers = []; this.eventMarkers = []; this.corporateMarkers = []; this.markers.setMarkers([]);
    this.candles.setData([]);
    this.volume.setData([]);
    this.bars = [];
    this.mapper = null;
    this.header.textContent = '載入行情…';
  }
  load(
    symbol: string,
    timeframe: Timeframe,
    result: BarResult,
    drawings: Drawing[],
    indicators: IndicatorInstance[],
    range?: ViewRange,
    legacyVolume = true,
  ) {
    this.detachController();
    this.indicators.clear();
    this.researchMarkers = []; this.eventMarkers = []; this.corporateMarkers = []; this.markers.setMarkers([]);
    this.chart.clearCrosshairPosition();
    this.symbol = symbol;
    this.timeframe = timeframe;
    this.bars = result.bars;
    this.barIndices = new Map(result.bars.map((b, i) => [b.time, i]));
    this.allDrawings = drawings;
    this.revision++;
    this.mapper = new TimeMapper(result.bars, timeframe);
    const transform = new ChartTransform(this.chart, this.candles, this.mapper);
    this.candles.setData([
      ...result.bars.map((b) => ({ ...b, time: b.time as UTCTimestamp })),
      ...this.mapper.futureWhitespace().map((b) => ({ time: b.time as UTCTimestamp })),
    ]);
    this.volume.setData(
      result.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? '#39baa026' : '#ef6b7b26',
      })),
    );
    this.chart.applyOptions({ timeScale: { timeVisible: timeframe !== '1D' && timeframe !== '1W' } });
    const visible = drawings.filter((d) => drawingVisible(d, symbol, timeframe));
    const machine = new DrawingStateMachine(
      symbol,
      this.mapper,
      transform,
      visible,
      (next, label) => {
        // Preserve any future timeframe-scoped objects not visible in this view.
        const hidden = this.allDrawings.filter((d) => !drawingVisible(d, symbol, timeframe));
        this.callbacks.commit(symbol, [...hidden, ...next], label);
      },
      this.callbacks.selection,
      this.callbacks.defaults,
    );
    const primitive = new DrawingPrimitive(() => machine.scene(), transform);
    this.candles.attachPrimitive(primitive);
    this.controller = new DrawingController(
      this.host,
      this.chart,
      machine,
      primitive,
      this.callbacks.tool,
    );
    this.volume.applyOptions({ visible: legacyVolume && !indicators.some(i => i.type === 'Volume') });
    this.indicators.sync(indicators, result.bars, timeframe, this.revision);
    this.chart.timeScale().setVisibleLogicalRange(restoreViewRange(range, result.bars.length));
    this.ohlcBar = result.bars.at(-1) ?? null;
    this.renderHeader();
    this.sourceLabel.textContent = `${result.source} · ${result.session.toUpperCase()} · ${result.dataState ?? (result.delayed ? 'DELAYED' : 'SIMULATED')} · ${result.cacheStatus ?? 'fresh'} · last bar ${new Date(result.bars.at(-1)!.time * 1000).toLocaleString()}`;
  }
  sync(drawings: Drawing[], indicators: IndicatorInstance[], magnet: boolean, tool: ActiveTool, legacyVolume = true) {
    if (!this.controller) return;
    this.allDrawings = drawings;
    const m = this.controller.machine;
    m.drawings = drawings.filter((d) => drawingVisible(d, this.symbol, this.timeframe));
    m.magnetOn = magnet;
    if (m.tool !== tool) this.controller.setTool(tool);
    if (m.selectedId && !m.drawings.some((d) => d.id === m.selectedId)) {
      m.select(null);
    }
    this.volume.applyOptions({ visible: legacyVolume && !indicators.some(i => i.type === 'Volume') });
    this.indicators.sync(indicators, this.bars, this.timeframe, this.revision);
    this.controller.refresh();
  }
  setStrategy(result: StrategyResult | null) {
    this.researchMarkers = result?.config.symbol === this.symbol && result.config.timeframe === this.timeframe
      ? result.markers.filter(m => this.barIndices.has(m.time)).map(m => ({ time: m.time as UTCTimestamp, position: m.action === 'BUY' || m.action === 'COVER' ? 'belowBar' as const : 'aboveBar' as const, color: m.action === 'BUY' || m.action === 'COVER' ? '#66dbbb' : '#f09baa', shape: m.action === 'BUY' || m.action === 'COVER' ? 'arrowUp' as const : 'arrowDown' as const, text: m.action, id: `research-${m.time}-${m.action}` })) : [];
    this.refreshMarkers();
  }
  private eventBar(time: number): number | null {
    if(!this.bars.length || time < this.bars[0].time - 86400 || time > this.bars.at(-1)!.time + 86400) return null;
    const day = Math.floor(time / 86400);
    let lo=0, hi=this.bars.length;
    while(lo<hi) { const mid=(lo+hi)>>>1; if(Math.floor(this.bars[mid].time/86400)<day)lo=mid+1;else hi=mid; }
    return this.bars[lo]?.time ?? null;
  }
  setFilings(events: readonly FilingEvent[]) {
    this.eventMarkers = events.flatMap(e => {
      const time = this.eventBar(e.time);
      return time === null ? [] : [{ time: time as UTCTimestamp, position: 'aboveBar' as const, color: '#bca5e0', shape: 'circle' as const, text: `SEC ${e.form}`, id: e.accession }];
    });
    this.refreshMarkers();
  }
  setCorporateEvents(events: readonly { time: number; type: 'dividend'|'split'; value: number }[]) {
    this.corporateMarkers = events.flatMap(event => {
      const time = this.eventBar(event.time);
      return time === null ? [] : [{ time: time as UTCTimestamp, position: 'belowBar' as const, color: '#e4c987', shape: 'square' as const, text: event.type === 'split' ? `Split ×${event.value}` : `Dividend ${event.value}`, id: `corporate-${event.type}-${event.time}` }];
    });
    this.refreshMarkers();
  }
  private refreshMarkers() { this.markers.setMarkers([...this.eventMarkers, ...this.corporateMarkers, ...this.researchMarkers].sort((a,b) => Number(a.time)-Number(b.time))); }
  setSelection(id: string | null) {
    this.controller?.machine.select(id);
    this.controller?.refresh();
  }
  resetView() {
    const n = this.bars.length - 1;
    this.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 40 });
    this.scheduleView();
  }
  futureArea() {
    const n = this.bars.length - 1;
    this.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 80), to: n + 90 });
    this.scheduleView();
  }
  zoom(factor: number) {
    const r = this.chart.timeScale().getVisibleLogicalRange();
    if (r) {
      const center = (r.from + r.to) / 2,
        half = ((r.to - r.from) / 2) * factor;
      this.chart.timeScale().setVisibleLogicalRange({ from: center - half, to: center + half });
      this.scheduleView();
    }
  }
  private crosshair = (param: MouseEventParams) => {
    const data = param.seriesData.get(this.candles);
    this.ohlcBar = data && 'open' in data ? (data as unknown as Bar) : (this.bars.at(-1) ?? null);
    if (!this.ohlcRaf)
      this.ohlcRaf = requestAnimationFrame(() => {
        this.ohlcRaf = 0;
        this.renderHeader();
      });
  };
  private renderHeader() {
    const b = this.ohlcBar;
    if (!b) {
      this.header.textContent = '';
      return;
    }
    const index = this.barIndices.get(b.time) ?? -1,
      previous = index > 0 ? this.bars[index - 1].close : b.open,
      change = b.close - previous;
    this.header.textContent = `O ${b.open.toFixed(2)}   H ${b.high.toFixed(2)}   L ${b.low.toFixed(2)}   C ${b.close.toFixed(2)}   ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${((change / previous) * 100).toFixed(2)}%)`;
    this.header.style.color = change >= 0 ? '#59cfb7' : '#ef8692';
  }
  private scheduleView = () => {
    if (this.viewTimer) clearTimeout(this.viewTimer);
    this.viewTimer = setTimeout(() => {
      this.viewTimer = null;
      this.saveView();
    }, 350);
  };
  private saveView() {
    if (this.bars.length) {
      const r = this.chart.timeScale().getVisibleLogicalRange();
      if (r)
        this.callbacks.view(this.symbol, this.timeframe, {
          from: Number(r.from),
          to: Number(r.to),
          barCount: this.bars.length,
        });
    }
  }
  flushView() {
    if (this.viewTimer) {
      clearTimeout(this.viewTimer);
      this.viewTimer = null;
      this.saveView();
    }
  }
  private detachController() {
    if (this.controller) {
      this.controller.destroy();
      this.candles.detachPrimitive(this.controller.primitive);
      this.controller = null;
    }
  }
  destroy() {
    this.flushView();
    this.detachController();
    cancelAnimationFrame(this.ohlcRaf);
    this.host.removeEventListener('pointerup', this.scheduleView);
    this.host.removeEventListener('wheel', this.scheduleView);
    this.chart.unsubscribeCrosshairMove(this.crosshair);
    this.chart.remove();
  }
}

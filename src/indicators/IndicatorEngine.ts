import {
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { IndicatorRegistry, type IndicatorInstance, type IndicatorType } from './IndicatorRegistry';
import { ema } from './ExponentialMovingAverage';
import { sma } from './MovingAverage';
import { volume } from './Volume';
import type { Bar, Timeframe } from '../market-data/MarketDataProvider';

type SeriesEntry =
  | {
      kind: 'Line';
      type: IndicatorType;
      api: ISeriesApi<'Line'>;
      signature: string;
    }
  | {
      kind: 'Histogram';
      type: IndicatorType;
      api: ISeriesApi<'Histogram'>;
      signature: string;
    };

export class IndicatorEngine {
  private series = new Map<string, SeriesEntry>();
  readonly registry = new IndicatorRegistry();

  constructor(private chart: IChartApi) {
    this.registry.register({ type: 'SMA', series: 'Line', calculate: sma });
    this.registry.register({ type: 'EMA', series: 'Line', calculate: ema });
    this.registry.register({
      type: 'Volume',
      series: 'Histogram',
      calculate: (bars) => volume(bars),
    });
  }

  sync(
    instances: readonly IndicatorInstance[],
    bars: readonly Bar[],
    timeframe: Timeframe,
    dataRevision: number,
  ) {
    const active = instances.filter((i) => !i.scope.timeframe || i.scope.timeframe === timeframe);
    const ids = new Set(active.map((i) => i.id));
    for (const [id, entry] of this.series) {
      if (!ids.has(id)) {
        this.chart.removeSeries(entry.api);
        this.series.delete(id);
      }
    }

    for (const instance of active) {
      const definition = this.registry.get(instance.type);
      if (!definition) continue;

      let entry = this.series.get(instance.id);
      if (entry && (entry.kind !== definition.series || entry.type !== instance.type)) {
        this.chart.removeSeries(entry.api);
        this.series.delete(instance.id);
        entry = undefined;
      }

      if (!entry && definition.series === 'Line') {
        entry = {
          kind: 'Line',
          type: instance.type,
          api: this.chart.addSeries(LineSeries, {
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          }),
          signature: '',
        };
        this.series.set(instance.id, entry);
      } else if (!entry && definition.series === 'Histogram') {
        const priceScaleId = `volume-indicator-${instance.id}`;
        const api = this.chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        api.priceScale().applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } });
        entry = { kind: 'Histogram', type: instance.type, api, signature: '' };
        this.series.set(instance.id, entry);
      }

      if (!entry) continue;

      const title = instance.type === 'Volume' ? 'Volume' : `${instance.type} ${instance.period}`;
      const signature = `${dataRevision}:${instance.type}:${instance.period}:${instance.source}`;
      if (entry.kind === 'Line') {
        entry.api.applyOptions({
          color: instance.color,
          lineWidth: instance.lineWidth,
          visible: instance.visible,
          title,
        });
        if (entry.signature !== signature) {
          const data = definition.calculate(bars, instance.period, instance.source);
          entry.api.setData(data.map((point) => ({ ...point, time: point.time as UTCTimestamp })));
          entry.signature = signature;
        }
      } else {
        entry.api.applyOptions({ color: instance.color, visible: instance.visible, title });
        if (entry.signature !== signature) {
          const data = definition.calculate(bars, instance.period, instance.source);
          entry.api.setData(data.map((point) => ({ ...point, time: point.time as UTCTimestamp })));
          entry.signature = signature;
        }
      }
    }
  }

  clear() {
    for (const entry of this.series.values()) this.chart.removeSeries(entry.api);
    this.series.clear();
  }
}
